import { loadFilters, saveFilters, syncFlushPendingFilterSave, onFiltersChanged } from "../util/storage";
import { isAmazonSearchPage, buildSortByReviewsUrl, buildAmazonOnlyUrl, getSearchQuery } from "../util/url";
import { initAllowlist, isAllowlisted } from "../brand/allowlist";
import { extractAllProducts, extractProduct, getProductCards } from "./extractor";
import { applyFilters, applyFilterResult, markTrusted } from "./filters";
import { createFilterBar, updateStats } from "./ui/filterBar";
import { injectCardActions } from "./ui/cardActions";
import { injectReviewBadge, REVIEW_BADGE_STYLES } from "./ui/reviewBadge";
import { injectReviewInsights, REVIEW_INSIGHTS_STYLES } from "./ui/reviewInsights";
import { startObserving, stopObserving, refilterAll, updateObserverFilters } from "./observer";
import { findDuplicates } from "./dedup";
import { createRateLimitedFetcher } from "../review/fetcher";
import { computeReviewScore, computeReviewScoreWithML } from "../review/analyzer";
import { getCachedScore, setCachedScore } from "../review/cache";
import { getProductInsights } from "../review/categories";
import type { FilterState, Product } from "../types";
import type { ReviewScore, ProductInsights, ProductReviewData } from "../review/types";

// CSS classes for product card visual states
const GLOBAL_STYLES = `
  .bas-hidden { display: none !important; }
  .bas-dimmed { opacity: 0.4; transition: opacity 0.2s; }
  .bas-dimmed:hover { opacity: 0.8; }
  .bas-trusted { border-left: 3px solid #067d62 !important; }
${REVIEW_BADGE_STYLES}
${REVIEW_INSIGHTS_STYLES}
`;

// CSS to hide the top sponsored carousel/slot
const SPONSORED_TOPSLOT_STYLES = `
  div.s-top-slot,
  div[data-component-type="s-top-ads-feedback"],
  div[cel_widget_id*="MAIN-TOP_BANNER"],
  div[cel_widget_id*="TOP-BANNER"],
  div[data-component-type="s-ads-metrics"],
  div[data-cel-widget*="top_sponsored"],
  div.AdHolder,
  div[data-component-type="s-top-slot"] {
    display: none !important;
  }
`;

let currentFilters: FilterState;
let filterBarHost: HTMLElement | null = null;
const fetchReview = createRateLimitedFetcher(2, 500);
/** Map ASIN → ReviewScore for products already scored this session. */
const reviewScoreMap = new Map<string, ReviewScore>();
/** Map ASIN → ProductInsights for category breakdown. */
const productInsightsMap = new Map<string, ProductInsights>();
/** Map ASIN → raw review data for recomputing insights when categories change. */
const reviewDataMap = new Map<string, ProductReviewData>();

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

  // Apply sponsored top-slot hiding if enabled
  updateSponsoredTopSlotVisibility(currentFilters.hideSponsored);

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

  // First pass: apply individual filters
  const filterResults: ("show" | "hide" | "dim")[] = [];
  for (const product of products) {
    // Attach cached review quality if available
    if (product.asin && reviewScoreMap.has(product.asin)) {
      product.reviewQuality = reviewScoreMap.get(product.asin)!.score;
    }

    // Attach adjusted rating if categories are being ignored
    if (product.asin && productInsightsMap.has(product.asin) && currentFilters.ignoredCategories.length > 0) {
      product.adjustedRating = productInsightsMap.get(product.asin)!.adjustedRating;
    }

    const result = await applyFilters(product, currentFilters);
    filterResults.push(result);
  }

  // Second pass: apply variant deduplication among non-hidden products
  let dedupSet = new Set<number>();
  if (currentFilters.dedupCategories.length > 0) {
    // Build list of products that survived individual filters
    const visibleProducts: Product[] = [];
    const visibleIndices: number[] = [];
    for (let i = 0; i < products.length; i++) {
      if (filterResults[i] !== "hide") {
        visibleProducts.push(products[i]);
        visibleIndices.push(i);
      }
    }
    // Find duplicates among visible products
    const visibleDups = findDuplicates(visibleProducts, currentFilters.dedupCategories);
    // Map back to original indices
    for (const vi of visibleDups) {
      dedupSet.add(visibleIndices[vi]);
    }
  }

  // Third pass: apply results to DOM
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    let result = filterResults[i];

    // Override to hide if it's a duplicate variant
    if (dedupSet.has(i)) {
      result = "hide";
    }

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

  // Queue review analysis for products with ASINs (non-blocking)
  queueReviewAnalysis(products);
}

/**
 * Handle filter state changes from the filter bar.
 * Updates in-memory state immediately, saves are debounced (300ms).
 */
function handleFilterChange(newState: FilterState): void {
  const categoriesChanged =
    JSON.stringify(currentFilters.ignoredCategories) !== JSON.stringify(newState.ignoredCategories);
  currentFilters = newState;
  // Debounced save — coalesces rapid changes, flushes on beforeunload
  saveFilters(currentFilters);
  updateObserverFilters(currentFilters);
  updateSponsoredTopSlotVisibility(currentFilters.hideSponsored);

  // Recompute insights if ignored categories changed
  if (categoriesChanged) {
    for (const [asin, reviewData] of reviewDataMap) {
      const insights = getProductInsights(reviewData.reviews, currentFilters.ignoredCategories);
      productInsightsMap.set(asin, insights);
    }
    // Re-inject insights panels on all visible product cards
    const products = extractAllProducts();
    for (const product of products) {
      if (product.asin && productInsightsMap.has(product.asin)) {
        injectReviewInsights(product.element, productInsightsMap.get(product.asin)!, currentFilters.ignoredCategories);
      }
    }
  }

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

/**
 * Toggle the sponsored top-slot/carousel visibility.
 * Injects or removes a <style> element that hides the entire top sponsored row.
 */
function updateSponsoredTopSlotVisibility(hide: boolean): void {
  const styleId = "bas-sponsored-topslot-styles";
  const existing = document.getElementById(styleId);
  if (hide && !existing) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = SPONSORED_TOPSLOT_STYLES;
    document.head.appendChild(style);
  } else if (!hide && existing) {
    existing.remove();
  }
}

/**
 * Queue background review analysis for products that haven't been scored yet.
 * Non-blocking — badges update asynchronously as results arrive.
 */
function queueReviewAnalysis(products: Product[]): void {
  for (const product of products) {
    if (!product.asin) continue;
    const asin = product.asin;

    // Skip if already scored this session
    if (reviewScoreMap.has(asin)) {
      const score = reviewScoreMap.get(asin)!;
      injectReviewBadge(product.element, score);
      // Also inject insights if available
      if (productInsightsMap.has(asin)) {
        injectReviewInsights(product.element, productInsightsMap.get(asin)!, currentFilters.ignoredCategories);
      }
      continue;
    }

    // Show loading badge
    injectReviewBadge(product.element, null);

    // Check cache, then fetch if needed
    void (async () => {
      try {
        // Try cache first
        let score = await getCachedScore(asin);
        let reviewData: ProductReviewData | null = null;
        if (!score) {
          // Fetch and analyze
          reviewData = await fetchReview(asin);
          // Only score if we got meaningful data
          if (reviewData.histogram || reviewData.reviews.length > 0) {
            score = currentFilters.useMLAnalysis
              ? await computeReviewScoreWithML(reviewData)
              : computeReviewScore(reviewData);
            await setCachedScore(asin, score).catch(() => {});
          }
        }

        if (score) {
          reviewScoreMap.set(asin, score);
          // Update the badge
          injectReviewBadge(product.element, score);
          // Attach score to product and re-apply filter if quality threshold is set
          if (currentFilters.minReviewQuality > 0) {
            product.reviewQuality = score.score;
            const result = await applyFilters(product, currentFilters);
            applyFilterResult(product.element, result);
          }
        }

        // Compute and inject category insights
        if (reviewData && reviewData.reviews.length > 0) {
          reviewDataMap.set(asin, reviewData);
          const insights = getProductInsights(reviewData.reviews, currentFilters.ignoredCategories);
          productInsightsMap.set(asin, insights);
          injectReviewInsights(product.element, insights, currentFilters.ignoredCategories);
          if (currentFilters.ignoredCategories.length > 0) {
            product.adjustedRating = insights.adjustedRating;
            const result = await applyFilters(product, currentFilters);
            applyFilterResult(product.element, result);
          }
        }
      } catch (err) {
        console.warn("[BAS] Review analysis error:", err);
      }
    })();
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────
main().catch((err) => console.error("[BAS] Error:", err));
