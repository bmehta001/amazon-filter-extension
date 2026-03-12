import { loadFilters, saveFilters, syncFlushPendingFilterSave, onFiltersChanged } from "../util/storage";
import { isAmazonSearchPage, buildSortByReviewsUrl, buildAmazonOnlyUrl, getSearchQuery } from "../util/url";
import { initAllowlist, isAllowlisted } from "../brand/allowlist";
import { extractAllProducts, extractProduct, getProductCards } from "./extractor";
import { applyFilters, applyFilterResult, markTrusted } from "./filters";
import { createFilterBar, updateStats } from "./ui/filterBar";
import { injectCardActions } from "./ui/cardActions";
import { startObserving, stopObserving, refilterAll, updateObserverFilters } from "./observer";
import type { FilterState, Product } from "../types";

// CSS classes for product card visual states
const GLOBAL_STYLES = `
  .bas-hidden { display: none !important; }
  .bas-dimmed { opacity: 0.4; transition: opacity 0.2s; }
  .bas-dimmed:hover { opacity: 0.8; }
  .bas-trusted { border-left: 3px solid #067d62 !important; }
`;

let currentFilters: FilterState;
let filterBarHost: HTMLElement | null = null;

/**
 * Main entry point — runs when the content script is injected.
 */
async function main(): Promise<void> {
  if (!isAmazonSearchPage()) return;

  console.log("[BAS] Better Amazon Search activated");

  // Inject global styles
  injectGlobalStyles();

  // Load saved filters and brand allowlist concurrently
  const [filters] = await Promise.all([loadFilters(), initAllowlist()]);
  currentFilters = filters;

  // Inject the filter bar UI
  filterBarHost = createFilterBar(currentFilters, {
    onFilterChange: handleFilterChange,
    onQueryBuilderApply: handleQueryBuilderApply,
    onSortByReviews: handleSortByReviews,
    onAmazonOnly: handleAmazonOnly,
  });

  const insertionPoint = findInsertionPoint();
  if (insertionPoint) {
    insertionPoint.before(filterBarHost);
  } else {
    // Fallback: prepend to main content
    const main =
      document.querySelector("#search") ||
      document.querySelector('[data-component-type="s-search-results"]');
    if (main) {
      main.prepend(filterBarHost);
    }
  }

  // Initial filtering pass
  await filterAllProducts();

  // Start observing for dynamic content
  startObserving(currentFilters);

  // Listen for storage changes from other tabs/popup (debounced in storage.ts)
  onFiltersChanged(async (newFilters) => {
    currentFilters = newFilters;
    updateObserverFilters(currentFilters);
    await filterAllProducts();
  });

  // Flush pending saves before page unload to prevent data loss.
  // visibilitychange fires reliably on tab close/navigate; beforeunload is a fallback.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      syncFlushPendingFilterSave();
    }
  });
  window.addEventListener("beforeunload", () => {
    syncFlushPendingFilterSave();
  });
}

/**
 * Apply filters to all products on the page.
 */
async function filterAllProducts(): Promise<void> {
  const products = extractAllProducts();
  let shown = 0;

  for (const product of products) {
    const result = await applyFilters(product, currentFilters);
    applyFilterResult(product.element, result);

    if (result !== "hide") {
      shown++;
    }

    if (isAllowlisted(product.brand)) {
      markTrusted(product.element);
    }

    // Inject per-card actions
    injectCardActions(product, () => refilterAll(currentFilters));
  }

  // Update stats
  if (filterBarHost) {
    updateStats(filterBarHost, shown, products.length);
  }
}

/**
 * Handle filter state changes from the filter bar.
 * Updates in-memory state immediately, saves are debounced (300ms).
 */
function handleFilterChange(newState: FilterState): void {
  currentFilters = newState;
  // Debounced save — coalesces rapid changes, flushes on beforeunload
  saveFilters(currentFilters);
  updateObserverFilters(currentFilters);
  filterAllProducts();
}

/**
 * Apply excluded tokens to the Amazon search box as -token syntax.
 */
function handleQueryBuilderApply(excludeTokens: string[]): void {
  const searchInput = document.querySelector<HTMLInputElement>(
    '#twotabsearchtextbox, input[name="field-keywords"]',
  );
  if (!searchInput) return;

  const currentQuery = searchInput.value;
  const tokensToAdd = excludeTokens.filter(
    (t) => !currentQuery.includes(`-${t}`),
  );

  if (tokensToAdd.length > 0) {
    const suffix = tokensToAdd.map((t) => (t.includes(" ") ? `-"${t}"` : `-${t}`)).join(" ");
    searchInput.value = `${currentQuery} ${suffix}`.trim();
    // Focus to show user the update
    searchInput.focus();
    searchInput.select();
  }
}

/**
 * Navigate to sort-by-review-count URL.
 */
function handleSortByReviews(): void {
  window.location.href = buildSortByReviewsUrl();
}

/**
 * Navigate to Amazon-only seller filtered URL.
 */
function handleAmazonOnly(): void {
  window.location.href = buildAmazonOnlyUrl();
}

/**
 * Find the best insertion point for the filter bar.
 */
function findInsertionPoint(): Element | null {
  // Try above the search results grid
  return (
    document.querySelector(".s-main-slot") ||
    document.querySelector('[data-component-type="s-search-results"] .s-main-slot') ||
    document.querySelector(".s-result-list") ||
    document.querySelector("#search .s-desktop-content") ||
    null
  );
}

/**
 * Inject global CSS styles for filter results.
 */
function injectGlobalStyles(): void {
  if (document.getElementById("bas-global-styles")) return;
  const style = document.createElement("style");
  style.id = "bas-global-styles";
  style.textContent = GLOBAL_STYLES;
  document.head.appendChild(style);
}

// ── Bootstrap ────────────────────────────────────────────────────────
main().catch((err) => console.error("[BAS] Error:", err));
