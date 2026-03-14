import { getProductCards } from "./extractor";

const TAG = "[BAS]";
const MAX_PAGES = 20;
const FETCH_DELAY_MS = 800;
const PRODUCT_CARD_SELECTOR = 'div[data-component-type="s-search-result"]';
/** Floor for items-per-page estimate when the current page has very few cards. */
const MIN_ITEMS_PER_PAGE = 16;

/** Status callback for progress updates. */
export type PaginationStatus = {
  currentPage: number;
  totalPages: number;
  totalProducts: number;
  done: boolean;
};

// ── Pure helpers (exported for testing) ─────────────────────────────

/**
 * Get the current page number from the URL.
 */
export function getCurrentPage(): number {
  const url = new URL(window.location.href);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  return isNaN(page) || page < 1 ? 1 : page;
}

/**
 * Calculate how many additional pages to fetch so that the total item
 * count reaches (or slightly exceeds) the target.
 *
 * Returns 0 when no fetching is needed.
 */
export function calculatePagesToFetch(
  currentItemCount: number,
  targetItemCount: number,
  estimatedItemsPerPage: number,
): number {
  if (targetItemCount <= currentItemCount || estimatedItemsPerPage <= 0) return 0;
  return Math.ceil((targetItemCount - currentItemCount) / estimatedItemsPerPage);
}

// ── DOM helpers ─────────────────────────────────────────────────────

function buildPageUrl(page: number): string {
  const url = new URL(window.location.href);
  url.searchParams.set("page", String(page));
  return url.toString();
}

function detectMaxPages(): number {
  const pageButtons = document.querySelectorAll(
    '.s-pagination-item:not(.s-pagination-next):not(.s-pagination-previous):not(.s-pagination-ellipsis)'
  );
  let maxPage = 1;
  for (const btn of pageButtons) {
    const num = parseInt(btn.textContent?.trim() || "0", 10);
    if (num > maxPage) maxPage = num;
  }
  return Math.min(maxPage, MAX_PAGES);
}

function findResultsContainer(): Element | null {
  return (
    document.querySelector(".s-main-slot") ||
    document.querySelector('[data-component-type="s-search-results"] .s-main-slot') ||
    document.querySelector(".s-result-list") ||
    null
  );
}

async function fetchPageCards(pageUrl: string): Promise<HTMLElement[]> {
  try {
    const response = await fetch(pageUrl, { credentials: "same-origin" });
    if (!response.ok) {
      console.warn(TAG, `Pagination fetch failed: HTTP ${response.status}`);
      return [];
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const cards = doc.querySelectorAll<HTMLElement>(PRODUCT_CARD_SELECTOR);

    const imported: HTMLElement[] = [];
    for (const card of cards) {
      const importedCard = document.importNode(card, true) as HTMLElement;
      importedCard.dataset.basPaginated = "true";
      imported.push(importedCard);
    }
    return imported;
  } catch (err) {
    console.warn(TAG, "Pagination fetch error:", err);
    return [];
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Pagination state ────────────────────────────────────────────────

let paginationActive = false;
const seenAsins = new Set<string>();

/**
 * Update Amazon's "Next" pagination link to skip past prefetched pages.
 */
export function updateNextPageLink(lastPage: number): void {
  const nextLink = document.querySelector<HTMLAnchorElement>(
    ".s-pagination-next:not(.s-pagination-disabled)"
  );
  if (nextLink?.href) {
    const url = new URL(nextLink.href);
    url.searchParams.set("page", String(lastPage + 1));
    nextLink.href = url.toString();
  }
}

/**
 * Start background pagination to reach the desired result count.
 *
 * Calculates how many extra pages are needed based on the current item
 * count and items-per-page estimate, then fetches them sequentially.
 * Changing the target resets state (caller should call removePaginatedCards
 * first and then start a fresh pagination).
 *
 * @param onStatus — progress callback
 * @param targetResultCount — desired total number of items on the page
 */
export async function startPagination(
  onStatus: (status: PaginationStatus) => void,
  targetResultCount: number,
): Promise<void> {
  if (paginationActive) return;
  paginationActive = true;

  const container = findResultsContainer();
  if (!container) {
    console.warn(TAG, "Cannot find results container for pagination");
    paginationActive = false;
    return;
  }

  // Record existing ASINs to avoid duplicates
  const existingCards = getProductCards();
  for (const card of existingCards) {
    const asin = card.dataset.asin;
    if (asin) seenAsins.add(asin);
  }

  const currentPage = getCurrentPage();
  const currentCount = existingCards.length;
  const itemsPerPage = Math.max(currentCount, MIN_ITEMS_PER_PAGE);
  const pagesToFetch = calculatePagesToFetch(currentCount, targetResultCount, itemsPerPage);

  if (pagesToFetch <= 0) {
    console.log(TAG, `Already have ${currentCount} items (target: ${targetResultCount})`);
    paginationActive = false;
    onStatus({ currentPage, totalPages: currentPage, totalProducts: currentCount, done: true });
    return;
  }

  const startPage = currentPage + 1;
  const endPage = Math.min(startPage + pagesToFetch - 1, detectMaxPages());

  if (startPage > endPage) {
    console.log(TAG, "No more pages available to fetch");
    paginationActive = false;
    onStatus({ currentPage, totalPages: currentPage, totalProducts: currentCount, done: true });
    return;
  }

  let totalProducts = currentCount;

  console.log(
    TAG,
    `Prefetching pages ${startPage}–${endPage} to reach ~${targetResultCount} items (currently ${currentCount})`,
  );

  for (let page = startPage; page <= endPage; page++) {
    if (!paginationActive) break;

    const pageUrl = buildPageUrl(page);
    const cards = await fetchPageCards(pageUrl);

    let injectedCount = 0;
    for (const card of cards) {
      const asin = card.dataset.asin;
      if (asin && seenAsins.has(asin)) continue;
      if (asin) seenAsins.add(asin);
      container.appendChild(card);
      injectedCount++;
    }

    totalProducts += injectedCount;
    console.log(TAG, `Page ${page}: +${injectedCount} products (${totalProducts} total)`);

    onStatus({
      currentPage: page,
      totalPages: endPage,
      totalProducts,
      done: page === endPage,
    });

    if (page < endPage) {
      await delay(FETCH_DELAY_MS);
    }
  }

  paginationActive = false;

  // Update Amazon's "Next" link to jump past fetched pages
  updateNextPageLink(endPage);

  onStatus({ currentPage: endPage, totalPages: endPage, totalProducts, done: true });
}

export function stopPagination(): void {
  paginationActive = false;
}

export function isPaginationActive(): boolean {
  return paginationActive;
}

/**
 * Remove all paginated cards from the DOM.
 */
export function removePaginatedCards(): void {
  const paginated = document.querySelectorAll('[data-bas-paginated="true"]');
  for (const card of paginated) {
    card.remove();
  }
  seenAsins.clear();
}
