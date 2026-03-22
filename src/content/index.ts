import { loadFilters, saveFilters, syncFlushPendingFilterSave, onFiltersChanged, loadPreferences, onPreferencesChanged } from "../util/storage";
import { isAmazonSearchPage, isAmazonHaulPage, isAmazonSupportedPage, buildAmazonOnlyUrl } from "../util/url";
import { resolveNetworkUsage } from "../util/network";
import { initAllowlist, isAllowlisted } from "../brand/allowlist";
import { createRateLimitedDetailFetcher } from "../brand/fetcher";
import type { ProductDetailResult } from "../brand/fetcher";
import { getCachedBrand, setCachedBrand } from "../brand/cache";
import { loadLearnedBrands, recordBrandLearning } from "../brand/learning";
import { extractAllProducts, extractProduct, getProductCards, extractBrandCandidate } from "./extractor";
import { extractAllHaulProducts, extractHaulProduct, getHaulProductCards } from "./haulExtractor";
import { applyFilters, applyFilterResult, markTrusted } from "./filters";
import { createFilterBar, updateStats, updatePrefetchStatus } from "./ui/filterBar";
import { createDistributedFilters, updateDistributedStats, updateDistributedPrefetchStatus, updateProcessingState, updateSortNote, cleanupDistributedFilters } from "./ui/sidebarWidgets";
import { injectCardActions } from "./ui/cardActions";
import { injectReviewBadge, REVIEW_BADGE_STYLES } from "./ui/reviewBadge";
import { injectReviewInsights, REVIEW_INSIGHTS_STYLES } from "./ui/reviewInsights";
import { RADAR_CHART_STYLES } from "./ui/radarChart";
import { injectPriceSparkline, PRICE_SPARKLINE_STYLES } from "./ui/priceSparkline";
import { injectDealBadge, DEAL_BADGE_STYLES } from "./ui/dealBadge";
import { injectRecallBadge, RECALL_BADGE_STYLES } from "./ui/recallBadge";
import { injectTrustBadge, TRUST_BADGE_STYLES } from "./ui/trustBadge";
import { injectSellerBadge, SELLER_BADGE_STYLES } from "./ui/sellerBadge";
import { injectConfidenceBadge, CONFIDENCE_BADGE_STYLES } from "./ui/confidenceBadge";
import type { ConfidenceInput } from "./ui/confidenceBadge";
import { injectDuplicateBadge, DUPLICATE_BADGE_STYLES } from "./ui/duplicateBadge";
import { detectCrossListingDuplicates } from "./crossListingDedup";
import { computeTrustScore } from "../review/trustScore";
import type { TrustScoreResult } from "../review/trustScore";
import { computeSellerTrust } from "../seller/trust";
import type { SellerTrustResult } from "../seller/trust";
import { computeListingIntegrity } from "../seller/listingSignals";
import type { ListingIntegrityResult } from "../seller/listingSignals";
import { computeDealScore } from "./dealScoring";
import { sortProducts, resetOriginalOrder } from "./sorting";
import { buildFilterReasons, createTransparencyTooltip, TRANSPARENCY_STYLES } from "./ui/transparencyTooltip";
import type { PageStats } from "./ui/transparencyTooltip";
import { tryShowFeatureTour, TOUR_STYLES } from "./ui/featureTour";
import { startObserving, stopObserving, refilterAll, updateObserverFilters } from "./observer";
import { startPagination, stopPagination, removePaginatedCards } from "./paginator";
import { findDuplicates } from "./dedup";
import { createRateLimitedFetcher } from "../review/fetcher";
import { computeReviewScore, computeReviewScoreWithML } from "../review/analyzer";
import { getCachedScore, setCachedScore } from "../review/cache";
import { getProductInsights } from "../review/categories";
import { generateReviewSummary, generateSummaryFromTopicScores } from "../review/summary";
import type { ReviewSummary } from "../review/summary";
import { buildExportRows, exportToCsv, exportToJson, exportToClipboard, downloadFile, getExportFilename } from "./export";
import type { EnrichmentMaps } from "./export";
import { loadCompareItems, onCompareChange, resetCompareCache } from "../compare/storage";
import { renderCompareTray, destroyCompareTray } from "./ui/compareTray";
import { injectSummaryPanel, SUMMARY_PANEL_STYLES } from "./ui/reviewSummaryPanel";
import type { SummaryPanelData } from "./ui/reviewSummaryPanel";
import { ADVANCED_SEARCH_STYLES, destroyAdvancedSearch } from "./ui/advancedSearch";
import { fetchRecallsViaServiceWorker, matchProductToRecalls, extractSearchQuery, clearRecallCache } from "../recall/checker";
import type { CpscRecall } from "../recall/types";
import type { FilterState, Product, SellerInfo, GlobalPreferences } from "../types";
import { DEFAULT_PREFERENCES } from "../types";
import type { ReviewScore, ProductInsights, ProductReviewData } from "../review/types";

// CSS classes for product card visual states
const REVIEW_SUMMARY_STYLES = SUMMARY_PANEL_STYLES;

const GLOBAL_STYLES = `
  .bas-hidden { display: none !important; }
  .bas-dimmed { opacity: 0.4; transition: opacity 0.2s; }
  .bas-dimmed:hover { opacity: 0.8; }
  .bas-trusted { border-left: 3px solid #067d62 !important; }
${REVIEW_BADGE_STYLES}
${REVIEW_INSIGHTS_STYLES}
${PRICE_SPARKLINE_STYLES}
${DEAL_BADGE_STYLES}
${TRANSPARENCY_STYLES}
${REVIEW_SUMMARY_STYLES}
${RADAR_CHART_STYLES}
${RECALL_BADGE_STYLES}
${TRUST_BADGE_STYLES}
${SELLER_BADGE_STYLES}
${CONFIDENCE_BADGE_STYLES}
${DUPLICATE_BADGE_STYLES}
${TOUR_STYLES}
${ADVANCED_SEARCH_STYLES}
`;

// CSS to hide all sponsored carousels/slots (top, mid-page, and bottom)
const SPONSORED_STYLES = `
  /* Top-slot sponsored banners */
  div.s-top-slot,
  div[data-component-type="s-top-ads-feedback"],
  div[cel_widget_id*="MAIN-TOP_BANNER"],
  div[cel_widget_id*="TOP-BANNER"],
  div[data-component-type="s-ads-metrics"],
  div[data-cel-widget*="top_sponsored"],
  div.AdHolder,
  div[data-component-type="s-top-slot"],

  /* Mid-page Sponsored Brands carousels (CSS-module hashed component) */
  div[class*="_c2Itd_content_"],
  div[data-component-type="s-searchgrid-carousel"],
  div.a-carousel-container[class*="sb-"],
  div[cel_widget_id*="MAIN-SHOPPING_ADVISER"],
  div[cel_widget_id*="MAIN-VIDEO"],
  div[cel_widget_id*="MAIN-FEATURED"],

  /* Generic: any search-result-row containing ad-feedback elements */
  .s-result-item:has(.adFeedbackMainComponent_b75d5b8a-b6c1-403d-82f3-b1a4c4ab0b23),
  .s-result-item:has([class*="ad-feedback"]),
  .s-result-item:has([class*="adFeedback"]),

  /* Bottom / sidebar sponsored blocks */
  div[data-component-type="s-bottom-slot"],
  div[cel_widget_id*="BOTTOM"] {
    display: none !important;
  }
`;

let currentFilters: FilterState;
let filterBarHost: HTMLElement | null = null;
/** Whether we're running on an Amazon Haul page vs. standard search. */
let isHaulMode = false;
/** Whether filter widgets are distributed across the sidebar (vs. monolithic bar). */
let isDistributedMode = false;
const fetchReview = createRateLimitedFetcher(2, 500);
const fetchDetails = createRateLimitedDetailFetcher(3, 500);
/** Soft-navigation poll interval ID for cleanup. */
let softNavIntervalId: ReturnType<typeof setInterval> | null = null;
/** Soft-navigation DOM observer for cleanup. */
let softNavObserver: MutationObserver | null = null;
/** Sidebar DOM observer — catches filter clicks that replace sidebar content. */
let sidebarNavObserver: MutationObserver | null = null;
/** Map ASIN → ReviewScore for products already scored this session. */
const reviewScoreMap = new Map<string, ReviewScore>();
/** Map ASIN → ProductInsights for category breakdown. */
const productInsightsMap = new Map<string, ProductInsights>();
/** Map ASIN → raw review data for recomputing insights when categories change. */
const reviewDataMap = new Map<string, ProductReviewData>();
/** Map ASIN → resolved brand name for products enriched via background fetch. */
const brandMap = new Map<string, string>();
/** Map ASIN → seller info for products enriched via background fetch. */
const sellerMap = new Map<string, SellerInfo>();
/** Map ASIN → country of origin for products enriched via background fetch. */
const originMap = new Map<string, string>();
/** Map ASIN → TrustScoreResult for review authenticity analysis. */
const trustScoreMap = new Map<string, TrustScoreResult>();
/** Map ASIN → SellerTrustResult for seller trust analysis. */
const sellerTrustMap = new Map<string, SellerTrustResult>();
/** Map ASIN → ListingIntegrityResult for listing hijack detection. */
const listingIntegrityMap = new Map<string, ListingIntegrityResult>();
/** Map ASIN → deal score (numeric) for export. */
const dealScoreExportMap = new Map<string, number>();
/** Map ASIN → ReviewSummary for export. */
const reviewSummaryMap = new Map<string, ReviewSummary>();
/** Last set of visible products (for export). */
let lastVisibleProducts: Product[] = [];
/** Global preferences loaded from popup settings. */
let currentPrefs: GlobalPreferences = { ...DEFAULT_PREFERENCES };

/**
 * Main entry point — runs when the content script is injected.
 */
async function main(): Promise<void> {
  isHaulMode = isAmazonHaulPage();
  if (!isHaulMode && !isAmazonSearchPage()) return;

  console.log(`[BAS] Better Amazon Search activated (${isHaulMode ? "Haul" : "Search"} mode)`);

  // Inject global styles
  injectGlobalStyles();

  // Load saved filters, preferences, brand allowlist, and learned brands concurrently
  const [filters, prefs] = await Promise.all([loadFilters(), loadPreferences(), initAllowlist(), loadLearnedBrands()]);
  currentFilters = filters;
  currentPrefs = prefs;

  // Apply preference defaults to filters for new sessions
  if (currentPrefs.hideSponsoredDefault && !currentFilters.hideSponsored) {
    currentFilters.hideSponsored = true;
  }
  if (currentPrefs.defaultBrandMode !== "off" && currentFilters.brandMode === "off") {
    currentFilters.brandMode = currentPrefs.defaultBrandMode;
  }
  if (currentPrefs.defaultSellerFilter !== "any" && currentFilters.sellerFilter === "any") {
    currentFilters.sellerFilter = currentPrefs.defaultSellerFilter;
  }
  if (currentPrefs.useMLAnalysis !== currentFilters.useMLAnalysis) {
    currentFilters.useMLAnalysis = currentPrefs.useMLAnalysis;
  }

  // Listen for preference changes from popup
  onPreferencesChanged((prefs) => {
    currentPrefs = prefs;
    // Re-filter to apply feature toggle changes (e.g., sparklines, badges)
    void filterAllProducts();
  });

  // Apply sponsored top-slot hiding if enabled
  updateSponsoredVisibility(currentFilters.hideSponsored);

  // Inject the filter bar, retrying if DOM isn't ready yet
  await injectFilterBar();

  // Initial filtering pass
  await filterAllProducts();

  // Show onboarding feature tour on first visit (non-blocking)
  void tryShowFeatureTour();

  // Initialize cross-search comparison tray
  onCompareChange(renderCompareTray);
  loadCompareItems().then(renderCompareTray).catch(() => { /* ignore */ });

  // Check for product recalls (non-blocking background task)
  void queueRecallCheck();

  // Start background pagination if viewing multiple pages (not on Haul — Haul uses infinite scroll)
  if (!isHaulMode && currentFilters.totalPages > 1) {
    startBackgroundPagination();
  }

  // Start observing for dynamic content
  startObserving(currentFilters);

  // Listen for storage changes from other tabs/popup (debounced in storage.ts)
  onFiltersChanged(async (newFilters) => {
    currentFilters = newFilters;
    updateObserverFilters(currentFilters);
    await filterAllProducts();
  });

  // Flush pending saves and clean up resources before page unload.
  // visibilitychange fires reliably on tab close/navigate; beforeunload is a fallback.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      syncFlushPendingFilterSave();
    }
  });
  window.addEventListener("beforeunload", () => {
    syncFlushPendingFilterSave();
    cleanupSoftNavigation();
    stopObserving();
  });

  // Watch for Amazon SPA-style soft navigation (URL changes without page reload)
  watchForSoftNavigation();
}

/**
 * Inject the filter bar into the page, with retry logic for dynamically
 * loaded layouts where the sidebar/results container may not exist yet.
 *
 * When a sidebar is found, uses distributed mode: individual filter widgets
 * are placed alongside Amazon's existing sidebar sections (Brand, Price,
 * Customer Review) for a contextually integrated experience.
 */
async function injectFilterBar(): Promise<void> {
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 500;

  const filterCallbacks = {
    onFilterChange: handleFilterChange,
    onQueryBuilderApply: handleQueryBuilderApply,
    onAmazonOnly: handleAmazonOnly,
    onExport: handleExport,
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Clean up previous instances
    if (filterBarHost?.parentElement) {
      filterBarHost.remove();
    }
    cleanupDistributedFilters();
    isDistributedMode = false;

    // On Haul pages, always use horizontal bar (no sidebar)
    const sidebarTarget = isHaulMode ? null : findSidebarTarget();

    // ── Distributed mode: inject widgets alongside Amazon's sidebar sections ──
    if (sidebarTarget) {
      filterBarHost = createDistributedFilters(currentFilters, filterCallbacks, sidebarTarget);
      isDistributedMode = true;
      console.log("[BAS] Distributed filter widgets injected into sidebar");
      return;
    }

    // ── Fallback: monolithic horizontal bar ──
    filterBarHost = createFilterBar(currentFilters, filterCallbacks);

    const insertionPoint = isHaulMode ? findHaulInsertionPoint() : findInsertionPoint();
    if (insertionPoint) {
      insertionPoint.before(filterBarHost);
      console.log(`[BAS] Filter bar injected above ${isHaulMode ? "Haul" : "search"} results`);
      return;
    }

    const fallback = isHaulMode
      ? (document.querySelector("main") || document.querySelector('[role="main"]'))
      : (document.querySelector("#search") || document.querySelector('[data-component-type="s-search-results"]'));
    if (fallback) {
      fallback.prepend(filterBarHost);
      console.log("[BAS] Filter bar injected into #search fallback");
      return;
    }

    // Last resort: prepend to body
    if (attempt === MAX_RETRIES) {
      document.body.prepend(filterBarHost);
      console.warn("[BAS] Filter bar injected into body (all selectors failed)");
      return;
    }

    // Wait and retry — DOM may not be ready yet
    console.log(`[BAS] Insertion point not found, retrying (${attempt + 1}/${MAX_RETRIES})...`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
}

/** Track the last URL to detect soft navigations. */
let lastUrl = location.href;

/**
 * Watch for Amazon's SPA-style navigation where the URL changes without
 * a full page reload (e.g. pagination, filter clicks). When detected,
 * re-inject the filter bar and re-apply filters.
 */
function watchForSoftNavigation(): void {
  // Poll for URL changes (popstate doesn't fire for pushState)
  const CHECK_INTERVAL_MS = 1000;

  softNavIntervalId = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log("[BAS] Soft navigation detected:", lastUrl);

      // Update mode — user might navigate between search and Haul
      isHaulMode = isAmazonHaulPage();
      if (!isAmazonSupportedPage()) return;

      // Always re-inject on soft navigation — Amazon replaces sidebar content
      // when its native filters are clicked, destroying our widgets
      resetOriginalOrder(); // clear stale sort tracking from previous page
      // Clear enrichment caches from previous page to bound memory usage
      brandMap.clear();
      sellerMap.clear();
      originMap.clear();
      trustScoreMap.clear();
      sellerTrustMap.clear();
      listingIntegrityMap.clear();
      dealScoreExportMap.clear();
      reviewSummaryMap.clear();
      reviewScoreMap.clear();
      productInsightsMap.clear();
      reviewDataMap.clear();
      lastVisibleProducts = [];
      resetCompareCache();
      destroyCompareTray();
      destroyAdvancedSearch();
      clearRecallCache();
      void injectFilterBar().then(() => filterAllProducts());
    }
  }, CHECK_INTERVAL_MS);

  // Also watch for DOM replacement of the results container AND sidebar
  const searchContainer = document.querySelector("#search") ||
    (isHaulMode ? document.querySelector("main, [role='main']") : null);
  const sidebarContainer = document.querySelector("#s-refinements, [data-component-type='s-refinements']");

  let reinjectTimer: ReturnType<typeof setTimeout> | null = null;
  const handleDomChange = () => {
    // Debounce — Amazon's re-render fires many mutations in quick succession
    if (reinjectTimer) return;
    reinjectTimer = setTimeout(() => {
      reinjectTimer = null;
      // Check if our widgets were removed from DOM
      const widgetsGone = filterBarHost && !filterBarHost.parentElement;
      // In distributed mode, also check if the sidebar's widget host was detached
      const sidebarHostGone = isDistributedMode &&
        !document.querySelector(".bas-sidebar-widget-host");

      if (widgetsGone || sidebarHostGone) {
        console.log("[BAS] Widgets removed from DOM, re-injecting");
        void injectFilterBar().then(() => filterAllProducts());
      }
    }, 300);
  };

  if (searchContainer) {
    softNavObserver = new MutationObserver(handleDomChange);
    softNavObserver.observe(searchContainer, { childList: true, subtree: false });
  }

  // Watch sidebar separately — Amazon replaces its children when filters are clicked
  if (sidebarContainer && sidebarContainer !== searchContainer) {
    sidebarNavObserver = new MutationObserver(handleDomChange);
    sidebarNavObserver.observe(sidebarContainer, { childList: true, subtree: true });
  }
}

/**
 * Clean up soft navigation watchers (interval + observer).
 */
function cleanupSoftNavigation(): void {
  if (softNavIntervalId !== null) {
    clearInterval(softNavIntervalId);
    softNavIntervalId = null;
  }
  if (softNavObserver) {
    softNavObserver.disconnect();
    softNavObserver = null;
  }
  if (sidebarNavObserver) {
    sidebarNavObserver.disconnect();
    sidebarNavObserver = null;
  }
}

/**
 * Apply filters to all products on the page.
 */
async function filterAllProducts(): Promise<void> {
  if (filterBarHost) {
    updateProcessingState(filterBarHost, "processing");
  }

  const products = isHaulMode ? extractAllHaulProducts() : extractAllProducts();
  let shown = 0;

  // First pass: apply individual filters
  const filterResults: ("show" | "hide" | "dim")[] = [];
  for (const product of products) {
    // Attach cached brand if the extractor couldn't determine one
    if (product.asin && !product.brandCertain && brandMap.has(product.asin)) {
      product.brand = brandMap.get(product.asin)!;
      product.brandCertain = true;
    }

    // Attach cached seller info if available
    if (product.asin && !product.seller && sellerMap.has(product.asin)) {
      product.seller = sellerMap.get(product.asin)!;
    }

    // Attach cached country of origin if available
    if (product.asin && !product.countryOfOrigin && originMap.has(product.asin)) {
      product.countryOfOrigin = originMap.get(product.asin)!;
    }

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

  // Third pass: apply results to DOM, track page stats for transparency
  const pageStats: PageStats = {
    total: products.length,
    visible: 0,
    hiddenSponsored: 0,
    hiddenMinReviews: 0,
    hiddenMinRating: 0,
    hiddenPrice: 0,
    hiddenBrand: 0,
    hiddenKeyword: 0,
    hiddenSeller: 0,
    hiddenDedup: 0,
  };
  const dealScoreMap = new Map<string, number>();
  const visibleProducts: Product[] = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    let result = filterResults[i];

    // Override to hide if it's a duplicate variant
    if (dedupSet.has(i)) {
      result = "hide";
      pageStats.hiddenDedup++;
    } else if (result === "hide") {
      // Track why hidden (approximate from filter state)
      if (currentFilters.hideSponsored && product.isSponsored) pageStats.hiddenSponsored++;
      else if (currentFilters.minReviews > 0 && product.reviewCount < currentFilters.minReviews) pageStats.hiddenMinReviews++;
      else if (currentFilters.minRating != null && product.rating < currentFilters.minRating) pageStats.hiddenMinRating++;
      else if (currentFilters.priceMin != null && product.price != null && product.price < currentFilters.priceMin) pageStats.hiddenPrice++;
      else if (currentFilters.priceMax != null && product.price != null && product.price > currentFilters.priceMax) pageStats.hiddenPrice++;
      else if (currentFilters.excludedBrands.some(b => b.toLowerCase() === product.brand.toLowerCase())) pageStats.hiddenBrand++;
      else if (currentFilters.brandMode === "trusted-only" || currentFilters.brandMode === "hide") pageStats.hiddenBrand++;
      else if (currentFilters.excludeTokens.some(t => product.title.toLowerCase().includes(t.toLowerCase()))) pageStats.hiddenKeyword++;
      else if (currentFilters.sellerFilter !== "any") pageStats.hiddenSeller++;
    }

    applyFilterResult(product.element, result);

    if (result !== "hide") {
      shown++;
      visibleProducts.push(product);
    }

    if (isAllowlisted(product.brand)) {
      markTrusted(product.element);
    }

    // Inject per-card actions
    injectCardActions(product, () => refilterAll(currentFilters));

    // Inject price history sparkline for visible products with ASINs
    if (currentPrefs.showSparklines && result !== "hide" && product.asin) {
      injectPriceSparkline(product.element, product.asin);
    }

    // Inject deal quality badge for products with deal signals
    if (currentPrefs.showDealBadges && result !== "hide") {
      const dealScore = computeDealScore(product);
      if (dealScore) {
        injectDealBadge(product.element, dealScore);
        if (product.asin) dealScoreMap.set(product.asin, dealScore.score);
      }
    }

    // Inject transparency tooltip
    const reasons = buildFilterReasons(product, currentFilters);
    const filterResultObj = { action: result, reasons };
    // Remove old tooltip if present
    product.element.querySelector(".bas-transparency-wrapper")?.remove();
    const tooltipEl = createTransparencyTooltip(product, filterResultObj, pageStats);
    // Reuse cached h2 element for tooltip insertion (avoids redundant DOM query)
    const titleArea = product.element.querySelector("h2");
    if (titleArea) {
      titleArea.parentElement?.appendChild(tooltipEl);
    }
  }

  pageStats.visible = shown;

  // Apply client-side sort if not default
  if (currentFilters.sortBy && currentFilters.sortBy !== "default") {
    sortProducts(visibleProducts, currentFilters.sortBy, dealScoreMap);
  } else {
    sortProducts(visibleProducts, "default");
  }

  // Sync export data
  lastVisibleProducts = visibleProducts;
  for (const [k, v] of dealScoreMap) dealScoreExportMap.set(k, v);

  // Cross-listing duplicate detection on visible products
  if (visibleProducts.length >= 2) {
    const { groups, indexToGroup } = detectCrossListingDuplicates(visibleProducts);
    for (let vi = 0; vi < visibleProducts.length; vi++) {
      const groupIdx = indexToGroup.get(vi);
      if (groupIdx !== undefined) {
        injectDuplicateBadge(visibleProducts[vi].element, groups[groupIdx], vi, visibleProducts);
      }
    }
  }

  // Update stats
  if (filterBarHost) {
    if (isDistributedMode) {
      updateDistributedStats(filterBarHost, shown, products.length);
      updateSortNote(filterBarHost, currentFilters.sortBy ?? "default", shown);
    } else {
      updateStats(filterBarHost, shown, products.length);
    }
  }

  // Queue review analysis for products with ASINs (non-blocking)
  if (currentPrefs.showReviewBadges) {
    queueReviewAnalysis(products);
  }

  // Queue brand + seller enrichment for products with ASINs (non-blocking)
  if (currentPrefs.preloadDetails) {
    if (filterBarHost) {
      updateProcessingState(filterBarHost, "processing", "⏳ Loading product data...");
    }
    queueDetailEnrichment(products);
    if (filterBarHost) {
      updateProcessingState(filterBarHost, "done");
    }
  }

  if (filterBarHost) {
    updateProcessingState(filterBarHost, "done");
  }
}

/**
 * Start fetching additional search result pages in the background.
 */
function startBackgroundPagination(): void {
  if (currentFilters.totalPages <= 1) return;

  const pagesToFetch = currentFilters.totalPages - 1;

  void startPagination(
    (status) => {
      if (filterBarHost) {
        const statusText = status.done
          ? `✓ ${status.totalProducts} items`
          : `Loading… ${status.totalProducts} items`;
        if (isDistributedMode) {
          updateDistributedPrefetchStatus(filterBarHost, statusText);
        } else {
          updatePrefetchStatus(filterBarHost, statusText);
        }
      }
    },
    pagesToFetch,
  );
}

/**
 * Handle filter state changes from the filter bar.
 * Updates in-memory state immediately, saves are debounced (300ms).
 */
function handleFilterChange(newState: FilterState): void {
  const categoriesChanged =
    JSON.stringify(currentFilters.ignoredCategories) !== JSON.stringify(newState.ignoredCategories);
  const prefetchChanged = currentFilters.totalPages !== newState.totalPages;
  currentFilters = newState;
  // Debounced save — coalesces rapid changes, flushes on beforeunload
  saveFilters(currentFilters);
  updateObserverFilters(currentFilters);
  updateSponsoredVisibility(currentFilters.hideSponsored);

  // Recompute insights if ignored categories changed
  if (categoriesChanged) {
    for (const [asin, reviewData] of reviewDataMap) {
      const insights = getProductInsights(reviewData.reviews, currentFilters.ignoredCategories);
      productInsightsMap.set(asin, insights);
    }
    // Re-inject insights panels on all visible product cards
    const products = isHaulMode ? extractAllHaulProducts() : extractAllProducts();
    for (const product of products) {
      if (product.asin && productInsightsMap.has(product.asin)) {
        injectReviewInsights(product.element, productInsightsMap.get(product.asin)!, currentFilters.ignoredCategories);
      }
    }
  }

  // Handle result count changes — reset and re-prefetch
  if (prefetchChanged) {
    stopPagination();
    removePaginatedCards();
    if (newState.totalPages > 1) {
      startBackgroundPagination();
    } else {
      if (filterBarHost) {
        if (isDistributedMode) {
          updateDistributedPrefetchStatus(filterBarHost, "");
        } else {
          updatePrefetchStatus(filterBarHost, "");
        }
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
 * Navigate to Amazon-only seller filtered URL.
 */
function handleAmazonOnly(): void {
  window.location.href = buildAmazonOnlyUrl();
}

/** Export visible search results in the requested format. */
function handleExport(format: "csv" | "json" | "clipboard"): void {
  const maps: EnrichmentMaps = {
    reviewScoreMap,
    trustScoreMap,
    sellerTrustMap,
    listingIntegrityMap,
    originMap,
    dealScoreMap: dealScoreExportMap,
    summaryMap: reviewSummaryMap,
  };
  const rows = buildExportRows(lastVisibleProducts, maps);
  if (rows.length === 0) {
    console.warn("[BAS] No products to export");
    return;
  }

  switch (format) {
    case "csv": {
      const csv = exportToCsv(rows);
      downloadFile(csv, getExportFilename("csv"), "text/csv;charset=utf-8");
      break;
    }
    case "json": {
      const json = exportToJson(rows);
      downloadFile(json, getExportFilename("json"), "application/json;charset=utf-8");
      break;
    }
    case "clipboard": {
      const tsv = exportToClipboard(rows);
      navigator.clipboard.writeText(tsv).then(
        () => console.log("[BAS] Exported to clipboard"),
        (err) => console.warn("[BAS] Clipboard write failed:", err),
      );
      break;
    }
  }
}

/**
 * Try to find Amazon's left sidebar/refinements panel.
 * Returns the container element if found, null otherwise.
 */
function findSidebarTarget(): Element | null {
  return (
    document.querySelector("#s-refinements") ||
    document.querySelector('[data-component-type="s-refinements"]') ||
    document.querySelector(".s-refinements") ||
    null
  );
}

/**
 * Find the best insertion point for the filter bar (fallback when no sidebar).
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
 * Find insertion point on Amazon Haul pages.
 * Haul is a React SPA — look for the main content grid area.
 */
function findHaulInsertionPoint(): Element | null {
  return (
    // Look for product grid containers
    document.querySelector('[data-testid*="product-grid"]') ||
    document.querySelector('[class*="product-grid"]') ||
    document.querySelector('[class*="ProductGrid"]') ||
    // Look for main content areas
    document.querySelector("main > div") ||
    document.querySelector('[role="main"] > div') ||
    // Generic grid/list containers with multiple children
    findFirstGridContainer() ||
    null
  );
}

/**
 * Find the first grid/flex container that likely holds product cards.
 * Used as a Haul fallback when specific selectors fail.
 */
function findFirstGridContainer(): Element | null {
  const containers = document.querySelectorAll("div, section");
  for (const el of containers) {
    const style = getComputedStyle(el);
    const isGrid = style.display === "grid" || style.display === "flex";
    const hasMultipleChildren = el.children.length >= 6;
    const hasImages = el.querySelectorAll("img").length >= 3;
    // Avoid picking up navbars or footers
    const isMainArea = !el.closest("nav, header, footer, #navbar");
    if (isGrid && hasMultipleChildren && hasImages && isMainArea) {
      return el;
    }
  }
  return null;
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
function updateSponsoredVisibility(hide: boolean): void {
  const styleId = "bas-sponsored-styles";
  const existing = document.getElementById(styleId);
  if (hide && !existing) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = SPONSORED_STYLES;
    document.head.appendChild(style);
  } else if (!hide && existing) {
    existing.remove();
  }
}

/**
 * Inject the composite confidence badge for a product, aggregating all
 * available trust dimensions. Called after any trust data becomes available.
 */
function injectConfidenceBadgeForProduct(asin: string, card: HTMLElement): void {
  const input: ConfidenceInput = {};
  if (trustScoreMap.has(asin)) input.reviewTrust = trustScoreMap.get(asin);
  if (sellerTrustMap.has(asin)) input.sellerTrust = sellerTrustMap.get(asin);
  if (listingIntegrityMap.has(asin)) input.listingIntegrity = listingIntegrityMap.get(asin);
  // Deal score is computed synchronously during filtering, check the map
  // (dealScoreMap only stores the numeric score, not the full object, so skip for now)

  // Only inject if we have at least 2 dimensions to show
  const dimensions = [input.reviewTrust, input.sellerTrust, input.listingIntegrity].filter(Boolean).length;
  if (dimensions >= 2) {
    injectConfidenceBadge(card, input);
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
      if (trustScoreMap.has(asin)) {
        injectTrustBadge(product.element, trustScoreMap.get(asin)!);
      }
      if (productInsightsMap.has(asin)) {
        injectReviewInsights(product.element, productInsightsMap.get(asin)!, currentFilters.ignoredCategories);
      }
      continue;
    }

    // Show loading badges
    injectReviewBadge(product.element, null);
    injectTrustBadge(product.element, null);

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

        // Compute and inject category insights + trust score
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

          // Compute and inject trust score
          const trustResult = computeTrustScore(reviewData, insights.categorizedReviews);
          trustScoreMap.set(asin, trustResult);
          injectTrustBadge(product.element, trustResult);

          // Update confidence badge with new review trust data
          injectConfidenceBadgeForProduct(asin, product.element);

          // Inject review summary — prefer sentence-level topic scores, fall back to keyword scan
          const summary = (insights.topicScores.length > 0)
            ? generateSummaryFromTopicScores(insights.topicScores)
            : generateReviewSummary(reviewData.reviews);
          if (summary) {
            const panelData: SummaryPanelData = { summary, insights };
            injectSummaryPanel(product.element, panelData);
            reviewSummaryMap.set(asin, summary);
          }
        }
      } catch (err) {
        console.warn("[BAS] Review analysis error:", err);
      }
    })();
  }
}

/**
 * Asynchronously resolve brands and seller info for products.
 * Fetches the product detail page and extracts both brand and seller.
 * Respects the networkUsage setting — skips if "minimal".
 */
function queueDetailEnrichment(products: Product[]): void {
  if (resolveNetworkUsage(currentFilters.networkUsage) === "minimal") return;

  for (const product of products) {
    if (!product.asin) continue;
    const asin = product.asin;
    const needsBrand = !product.brandCertain;
    const needsSeller = !product.seller;

    // Skip if both already resolved
    if (!needsBrand && !needsSeller) continue;

    // Attach from session cache if available
    if (needsBrand && brandMap.has(asin)) {
      product.brand = brandMap.get(asin)!;
      product.brandCertain = true;
      updateBrandDisplay(product);
    }
    if (needsSeller && sellerMap.has(asin)) {
      product.seller = sellerMap.get(asin)!;
      const sellerTrust = computeSellerTrust(product);
      if (sellerTrust) {
        sellerTrustMap.set(asin, sellerTrust);
        injectSellerBadge(product.element, sellerTrust);
      }
      const listing = computeListingIntegrity(product);
      if (listing) {
        listingIntegrityMap.set(asin, listing);
      }
      injectConfidenceBadgeForProduct(asin, product.element);
    }
    if (product.brandCertain && product.seller) continue;

    // Async: check cache, then fetch if needed
    void (async () => {
      try {
        let brand: string | null = null;
        let seller: SellerInfo | null = null;

        // Try brand cache first
        if (!product.brandCertain) {
          brand = await getCachedBrand(asin);
        }

        // If we still need brand or seller, fetch the detail page
        if ((!brand && !product.brandCertain) || !product.seller) {
          const details = await fetchDetails(asin);

          if (!brand && details.brand) {
            brand = details.brand;
            await setCachedBrand(asin, brand).catch(() => {});

            // Record learning
            const candidate = extractBrandCandidate(product.element, product.title);
            await recordBrandLearning(candidate, brand).catch(() => {});
          }

          seller = details.seller;

          if (details.countryOfOrigin) {
            originMap.set(asin, details.countryOfOrigin);
            product.countryOfOrigin = details.countryOfOrigin;
            updateOriginDisplay(product);
          }
        }

        let needsRefilter = false;

        if (brand) {
          brandMap.set(asin, brand);
          product.brand = brand;
          product.brandCertain = true;
          updateBrandDisplay(product);
          needsRefilter = true;
        }

        if (seller) {
          sellerMap.set(asin, seller);
          product.seller = seller;
          needsRefilter = true;

          // Inject seller trust badge
          const sellerTrust = computeSellerTrust(product);
          if (sellerTrust) {
            sellerTrustMap.set(asin, sellerTrust);
            injectSellerBadge(product.element, sellerTrust);
          }

          // Inject listing integrity
          const listing = computeListingIntegrity(product);
          if (listing) {
            listingIntegrityMap.set(asin, listing);
          }

          // Inject composite confidence badge
          injectConfidenceBadgeForProduct(asin, product.element);
        }

        if (product.countryOfOrigin) {
          needsRefilter = true;
        }

        if (needsRefilter) {
          const result = await applyFilters(product, currentFilters);
          applyFilterResult(product.element, result);
        }
      } catch (err) {
        console.warn("[BAS] Detail enrichment error:", err);
      }
    })();
  }
}

/**
 * Update the brand text shown on a product card after async resolution.
 */
function updateBrandDisplay(product: Product): void {
  // Update the card actions brand labels if present
  const brandLabel = product.element.querySelector(".bas-brand-label");
  if (brandLabel) {
    brandLabel.textContent = product.brand;
  }
}

/** Show a small country of origin flag on the product card. */
function updateOriginDisplay(product: Product): void {
  if (!product.countryOfOrigin) return;
  const existing = product.element.querySelector(".bas-origin-badge");
  if (existing) {
    existing.textContent = `🌍 ${product.countryOfOrigin}`;
    return;
  }
  const badge = document.createElement("span");
  badge.className = "bas-origin-badge";
  badge.textContent = `🌍 ${product.countryOfOrigin}`;
  badge.title = `Country of Origin: ${product.countryOfOrigin}`;
  badge.style.cssText = `
    display: inline-block; font-size: 10px; color: #565959;
    background: #f0f2f2; border-radius: 3px; padding: 1px 5px;
    margin-top: 2px; margin-left: 4px;
  `;
  // Insert near brand or title
  const actionBar = product.element.querySelector(".bas-card-actions");
  if (actionBar) {
    actionBar.appendChild(badge);
  }
}

// ── Recall Check ─────────────────────────────────────────────────────

/**
 * Fetch CPSC recalls for the current search query and match against products.
 * Runs once per page load as a non-blocking background task.
 */
async function queueRecallCheck(): Promise<void> {
  try {
    const searchQuery = extractSearchQuery();
    if (!searchQuery) return;

    const recalls = await fetchRecallsViaServiceWorker(searchQuery);
    if (recalls.length === 0) return;

    console.log(`[BAS] Found ${recalls.length} CPSC recalls for "${searchQuery}"`);

    // Re-extract products from DOM to get current titles
    const products = isHaulMode ? extractAllHaulProducts() : extractAllProducts();

    for (const product of products) {
      const matches = matchProductToRecalls(
        product.title,
        product.brand !== "Unknown" ? product.brand : undefined,
        recalls,
      );
      if (matches.length > 0) {
        injectRecallBadge(product.element, matches);
      }
    }
  } catch (err) {
    console.warn("[BAS] Recall check error:", err);
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────
main().catch((err) => console.error("[BAS] Error:", err));
