import { getProductCards } from "./extractor";

const TAG = "[BAS]";
const MAX_PAGES = 10;
const FETCH_DELAY_MS = 800;  // delay between page fetches to avoid throttling
const PRODUCT_CARD_SELECTOR = 'div[data-component-type="s-search-result"]';

/** Status callback for progress updates. */
export type PaginationStatus = {
  currentPage: number;
  totalPages: number;
  totalProducts: number;
  done: boolean;
};

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
  // Look for the last page number in Amazon's pagination
  const pageButtons = document.querySelectorAll(
    '.s-pagination-item:not(.s-pagination-next):not(.s-pagination-previous):not(.s-pagination-ellipsis)'
  );
  let maxPage = 1;
  for (const btn of pageButtons) {
    const num = parseInt(btn.textContent?.trim() || "0", 10);
    if (num > maxPage) maxPage = num;
  }
  // Cap at MAX_PAGES to be reasonable
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

    // Import each card node into the current document
    const imported: HTMLElement[] = [];
    for (const card of cards) {
      const importedCard = document.importNode(card, true) as HTMLElement;
      // Mark as paginated so we can identify them
      importedCard.dataset.basPaginated = "true";
      imported.push(importedCard);
    }
    return imported;
  } catch (err) {
    console.warn(TAG, "Pagination fetch error:", err);
    return [];
  }
}

/**
 * Delay helper.
 */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Track whether pagination is currently running. */
let paginationActive = false;
/** Track ASINs already on the page to avoid true duplicates. */
const seenAsins = new Set<string>();

/**
 * Start background pagination: fetch pages 2-N and inject cards into the current page.
 *
 * @param onStatus — callback fired after each page is fetched with progress info
 * @param maxPages — override for max pages to fetch (default: auto-detect, capped at 10)
 */
export async function startPagination(
  onStatus: (status: PaginationStatus) => void,
  maxPages?: number,
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

  const totalPages = maxPages ?? detectMaxPages();
  let totalProducts = existingCards.length;

  console.log(TAG, `Starting background pagination: fetching up to ${totalPages} pages`);

  for (let page = 2; page <= totalPages; page++) {
    if (!paginationActive) break;  // allow cancellation

    const pageUrl = buildPageUrl(page);
    const cards = await fetchPageCards(pageUrl);

    let injectedCount = 0;
    for (const card of cards) {
      const asin = card.dataset.asin;
      // Skip if we've already seen this ASIN (true duplicate, not variant)
      if (asin && seenAsins.has(asin)) continue;
      if (asin) seenAsins.add(asin);

      container.appendChild(card);
      injectedCount++;
    }

    totalProducts += injectedCount;
    console.log(TAG, `Page ${page}: injected ${injectedCount} new products (${totalProducts} total)`);

    onStatus({
      currentPage: page,
      totalPages,
      totalProducts,
      done: page === totalPages,
    });

    // Delay before next fetch to avoid throttling
    if (page < totalPages) {
      await delay(FETCH_DELAY_MS);
    }
  }

  paginationActive = false;
  onStatus({
    currentPage: totalPages,
    totalPages,
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
 * Remove all paginated cards from the DOM.
 */
export function removePaginatedCards(): void {
  const paginated = document.querySelectorAll('[data-bas-paginated="true"]');
  for (const card of paginated) {
    card.remove();
  }
  seenAsins.clear();
}
