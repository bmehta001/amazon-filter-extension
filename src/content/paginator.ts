import { getProductCards } from "./extractor";

const TAG = "[BAS]";
const MAX_PAGES = 20;
const FETCH_DELAY_MS = 800;  // delay between page fetches to avoid throttling
const PRODUCT_CARD_SELECTOR = 'div[data-component-type="s-search-result"]';

/** Status callback for progress updates. */
export type PaginationStatus = {
  currentPage: number;
  totalPages: number;
  totalProducts: number;
  done: boolean;
};

// ── Page awareness helpers ──────────────────────────────────────────

/**
 * Get the current page number from the URL.
 */
export function getCurrentPage(): number {
  const url = new URL(window.location.href);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  return isNaN(page) || page < 1 ? 1 : page;
}

/**
 * Session storage key for tracking prefetch state, scoped to the search query.
 */
function getSessionKey(): string {
  const url = new URL(window.location.href);
  const query = url.searchParams.get("k") || url.searchParams.get("field-keywords") || "";
  return `bas-prefetch:${query}`;
}

/**
 * Get the last prefetched page number from sessionStorage.
 */
function getLastPrefetchedPage(): number {
  try {
    const val = sessionStorage.getItem(getSessionKey());
    return val ? parseInt(val, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Save the last prefetched page number to sessionStorage.
 */
function setLastPrefetchedPage(page: number): void {
  try {
    sessionStorage.setItem(getSessionKey(), String(page));
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Clear prefetch state from sessionStorage for the current search query.
 */
function clearPrefetchState(): void {
  try {
    sessionStorage.removeItem(getSessionKey());
  } catch {}
}

// ── Page range calculation (pure, testable) ─────────────────────────

/**
 * Calculate which pages to prefetch, accounting for current page and
 * previously-prefetched pages (stored across navigations in sessionStorage).
 *
 * Returns null if there are no pages left to fetch.
 */
export function calculatePrefetchRange(
  currentPage: number,
  lastPrefetched: number,
  pagesToFetch: number,
  maxAvailablePages: number,
): { startPage: number; endPage: number } | null {
  // Start from whichever is further ahead: next page or past last prefetch
  const startPage = Math.max(currentPage + 1, lastPrefetched + 1);

  // Subtract pages already fetched beyond the current page
  const alreadyFetchedBeyondCurrent = Math.max(0, lastPrefetched - currentPage);
  const remaining = pagesToFetch - alreadyFetchedBeyondCurrent;

  if (remaining <= 0 || startPage > maxAvailablePages) {
    return null;
  }

  const endPage = Math.min(startPage + remaining - 1, maxAvailablePages);
  return { startPage, endPage };
}

// ── DOM helpers ─────────────────────────────────────────────────────

/**
 * Build the URL for a specific search results page.
 */
function buildPageUrl(page: number): string {
  const url = new URL(window.location.href);
  url.searchParams.set("page", String(page));
  return url.toString();
}

/**
 * Determine how many pages are available from the current page's DOM.
 * Looks for Amazon's pagination component.
 */
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

/**
 * Find the container where product cards should be appended.
 */
function findResultsContainer(): Element | null {
  return (
    document.querySelector(".s-main-slot") ||
    document.querySelector('[data-component-type="s-search-results"] .s-main-slot') ||
    document.querySelector(".s-result-list") ||
    null
  );
}

/**
 * Fetch a search results page and extract product card elements.
 * Returns cloned card elements ready for DOM insertion.
 */
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
 * Update Amazon's "Next" pagination link to skip past already-prefetched pages.
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
 * Start background pagination: fetch additional pages and inject cards into the
 * current page. Aware of the current page number and previously-prefetched pages
 * so that navigating forward never re-shows already-seen products.
 *
 * @param onStatus — callback fired after each page is fetched with progress info
 * @param pagesToFetch — how many extra pages to fetch beyond the current page
 */
export async function startPagination(
  onStatus: (status: PaginationStatus) => void,
  pagesToFetch: number,
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
  const lastPrefetched = getLastPrefetchedPage();
  const range = calculatePrefetchRange(
    currentPage,
    lastPrefetched,
    pagesToFetch,
    detectMaxPages(),
  );

  if (!range) {
    console.log(TAG, `No new pages to prefetch (current: ${currentPage}, last prefetched: ${lastPrefetched})`);
    paginationActive = false;
    onStatus({
      currentPage: lastPrefetched || currentPage,
      totalPages: lastPrefetched || currentPage,
      totalProducts: existingCards.length,
      done: true,
    });
    return;
  }

  const { startPage, endPage } = range;
  let totalProducts = existingCards.length;

  console.log(TAG, `Prefetching pages ${startPage}–${endPage} (current: ${currentPage}, last prefetched: ${lastPrefetched})`);

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
    setLastPrefetchedPage(page);

    console.log(TAG, `Page ${page}: injected ${injectedCount} new products (${totalProducts} total)`);

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

  // Update Amazon's "Next" link to jump past all prefetched pages
  updateNextPageLink(getLastPrefetchedPage());

  onStatus({
    currentPage: endPage,
    totalPages: endPage,
    totalProducts,
    done: true,
  });
}

/**
 * Stop any active pagination.
 */
export function stopPagination(): void {
  paginationActive = false;
}

/**
 * Check if pagination is currently running.
 */
export function isPaginationActive(): boolean {
  return paginationActive;
}

/**
 * Remove all paginated cards from the DOM and clear prefetch history.
 */
export function removePaginatedCards(): void {
  const paginated = document.querySelectorAll('[data-bas-paginated="true"]');
  for (const card of paginated) {
    card.remove();
  }
  seenAsins.clear();
  clearPrefetchState();
}
