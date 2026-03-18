import type { Product, FilterState } from "../../types";

export interface FilterResult {
  action: "show" | "hide" | "dim";
  reasons: FilterReason[];
}

export interface FilterReason {
  filter: string;        // e.g. "Min Reviews", "Price Range", "Brand Trust"
  passed: boolean;
  detail: string;        // e.g. "2,847 reviews (min: 50) ✓" or "3 reviews (min: 50) ✗"
}

export interface PageStats {
  total: number;
  visible: number;
  hiddenSponsored: number;
  hiddenMinReviews: number;
  hiddenMinRating: number;
  hiddenPrice: number;
  hiddenBrand: number;
  hiddenKeyword: number;
  hiddenSeller: number;
  hiddenDedup: number;
}

/**
 * Build filter reasons for a product given current filters.
 */
export function buildFilterReasons(product: Product, filters: FilterState): FilterReason[] {
  const reasons: FilterReason[] = [];

  // Sponsored
  if (filters.hideSponsored) {
    reasons.push({
      filter: "Sponsored",
      passed: !product.isSponsored,
      detail: product.isSponsored ? "Sponsored product ✗" : "Not sponsored ✓",
    });
  }

  // Min reviews
  if (filters.minReviews > 0) {
    const pass = product.reviewCount >= filters.minReviews;
    reasons.push({
      filter: "Min Reviews",
      passed: pass,
      detail: `${product.reviewCount.toLocaleString()} reviews (min: ${filters.minReviews}) ${pass ? "✓" : "✗"}`,
    });
  }

  // Min rating
  if (filters.minRating != null) {
    const pass = product.rating >= filters.minRating;
    reasons.push({
      filter: "Min Rating",
      passed: pass,
      detail: `${product.rating}★ (min: ${filters.minRating}★) ${pass ? "✓" : "✗"}`,
    });
  }

  // Price range
  if (filters.priceMin != null || filters.priceMax != null) {
    const price = product.price;
    let pass = true;
    let detail = "";
    if (price == null) {
      detail = "No price listed";
      pass = true; // Don't hide products without prices
    } else {
      if (filters.priceMin != null && price < filters.priceMin) pass = false;
      if (filters.priceMax != null && price > filters.priceMax) pass = false;
      const range = [
        filters.priceMin != null ? `$${filters.priceMin}` : "any",
        filters.priceMax != null ? `$${filters.priceMax}` : "any",
      ].join("–");
      detail = `$${price.toFixed(2)} (range: ${range}) ${pass ? "✓" : "✗"}`;
    }
    reasons.push({ filter: "Price Range", passed: pass, detail });
  }

  // Brand
  if (filters.brandMode !== "off" || filters.excludedBrands.length > 0) {
    const excluded = filters.excludedBrands.some(
      (b) => b.toLowerCase() === product.brand.toLowerCase()
    );
    const isTrusted = product.brandCertain === true;
    let pass = !excluded;
    let detail = `"${product.brand}"`;
    if (excluded) {
      detail += " — excluded ✗";
    } else if (filters.brandMode === "trusted-only" && !isTrusted) {
      pass = false;
      detail += " — not trusted ✗";
    } else if (isTrusted) {
      detail += " — trusted ✓";
    } else {
      detail += " ✓";
    }
    reasons.push({ filter: "Brand", passed: pass, detail });
  }

  // Keyword exclusion
  if (filters.excludeTokens.length > 0) {
    const titleLower = product.title.toLowerCase();
    const matchedToken = filters.excludeTokens.find((t) => titleLower.includes(t.toLowerCase()));
    reasons.push({
      filter: "Keywords",
      passed: !matchedToken,
      detail: matchedToken
        ? `Contains "${matchedToken}" ✗`
        : `No excluded keywords ✓`,
    });
  }

  // Seller filter
  if (filters.sellerFilter !== "any") {
    const seller = product.seller;
    let pass = true;
    let detail = "";
    if (!seller) {
      detail = "Seller unknown";
    } else if (filters.sellerFilter === "amazon") {
      pass = seller.fulfillment === "amazon";
      detail = pass ? "Sold by Amazon ✓" : `Sold by ${seller.sellerName || "third party"} ✗`;
    } else if (filters.sellerFilter === "fba") {
      pass = seller.fulfillment === "fba" || seller.fulfillment === "amazon";
      detail = pass ? "Fulfilled by Amazon ✓" : "Not FBA ✗";
    }
    reasons.push({ filter: "Seller", passed: pass, detail });
  }

  // Country of Origin
  if (filters.originInclude.length > 0 || filters.originExclude.length > 0 || filters.hideUnknownOrigin) {
    const origin = product.countryOfOrigin;
    let pass = true;
    let detail = "";
    if (!origin) {
      pass = !filters.hideUnknownOrigin;
      detail = pass ? "Origin unknown (allowed)" : "Origin unknown ✗";
    } else {
      const lower = origin.toLowerCase();
      if (filters.originExclude.some((c) => lower.includes(c.toLowerCase()))) {
        pass = false;
        detail = `${origin} — excluded ✗`;
      } else if (filters.originInclude.length > 0) {
        pass = filters.originInclude.some((c) => lower.includes(c.toLowerCase()));
        detail = pass ? `${origin} — included ✓` : `${origin} — not in include list ✗`;
      } else {
        detail = `${origin} ✓`;
      }
    }
    reasons.push({ filter: "Origin", passed: pass, detail });
  }

  return reasons;
}

/**
 * Create a tooltip element for a product card.
 */
export function createTransparencyTooltip(
  product: Product,
  filterResult: FilterResult,
  pageStats: PageStats,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "bas-transparency-wrapper";

  const icon = document.createElement("span");
  icon.className = "bas-transparency-icon";
  icon.textContent = "ℹ️";
  icon.title = "Why is this showing?";
  wrapper.appendChild(icon);

  const tooltip = document.createElement("div");
  tooltip.className = "bas-transparency-tooltip";

  // Header
  const header = document.createElement("div");
  header.className = "bas-tt-header";
  if (filterResult.action === "show") {
    header.textContent = "✅ Passed all filters";
  } else if (filterResult.action === "dim") {
    header.textContent = "⚠️ Dimmed (unverified brand)";
  } else {
    header.textContent = "❌ Hidden by filters";
  }
  tooltip.appendChild(header);

  // Filter reasons
  const reasonsList = document.createElement("div");
  reasonsList.className = "bas-tt-reasons";
  for (const reason of filterResult.reasons) {
    const line = document.createElement("div");
    line.className = `bas-tt-reason ${reason.passed ? "bas-tt-pass" : "bas-tt-fail"}`;
    line.textContent = `${reason.passed ? "•" : "✗"} ${reason.filter}: ${reason.detail}`;
    reasonsList.appendChild(line);
  }
  tooltip.appendChild(reasonsList);

  // Page stats
  const statsDiv = document.createElement("div");
  statsDiv.className = "bas-tt-stats";
  const hidden = Number(pageStats.total) - Number(pageStats.visible);

  const statsHeader = document.createElement("div");
  statsHeader.className = "bas-tt-stats-header";
  statsHeader.textContent = "📊 Page summary";
  statsDiv.appendChild(statsHeader);

  const summaryLine = document.createElement("div");
  summaryLine.textContent = `Showing ${Number(pageStats.visible)} of ${Number(pageStats.total)} products`;
  statsDiv.appendChild(summaryLine);

  const statEntries: [number, string][] = [
    [pageStats.hiddenSponsored, "sponsored"],
    [pageStats.hiddenMinReviews, "below review minimum"],
    [pageStats.hiddenMinRating, "below rating minimum"],
    [pageStats.hiddenPrice, "out of price range"],
    [pageStats.hiddenBrand, "brand filter"],
    [pageStats.hiddenKeyword, "keyword matches"],
    [pageStats.hiddenSeller, "seller filter"],
    [pageStats.hiddenDedup, "duplicate variants"],
  ];
  for (const [count, label] of statEntries) {
    if (Number(count) > 0) {
      const line = document.createElement("div");
      line.textContent = `Hidden: ${Number(count)} ${label}`;
      statsDiv.appendChild(line);
    }
  }
  if (hidden === 0) {
    const noFilter = document.createElement("div");
    noFilter.textContent = "No products filtered out";
    statsDiv.appendChild(noFilter);
  }
  tooltip.appendChild(statsDiv);

  wrapper.appendChild(tooltip);
  return wrapper;
}

/** CSS styles for transparency tooltips */
export const TRANSPARENCY_STYLES = `
.bas-transparency-wrapper {
  position: relative;
  display: inline-block;
  margin-left: 6px;
  vertical-align: middle;
}
.bas-transparency-icon {
  cursor: help;
  font-size: 14px;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.bas-transparency-icon:hover {
  opacity: 1;
}
.bas-transparency-tooltip {
  display: none;
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  padding: 10px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 12px;
  line-height: 1.4;
  color: #333;
  z-index: 10000;
  pointer-events: none;
}
.bas-transparency-wrapper:hover .bas-transparency-tooltip {
  display: block;
}
.bas-tt-header {
  font-weight: 600;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #eee;
}
.bas-tt-reasons {
  margin-bottom: 8px;
}
.bas-tt-reason {
  padding: 1px 0;
}
.bas-tt-pass {
  color: #555;
}
.bas-tt-fail {
  color: #c40000;
  font-weight: 500;
}
.bas-tt-stats {
  padding-top: 6px;
  border-top: 1px solid #eee;
  color: #666;
  font-size: 11px;
}
.bas-tt-stats-header {
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}
`;
