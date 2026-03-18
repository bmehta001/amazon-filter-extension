import type { Product, FilterState, FilterResult } from "../types";
import { isAllowlisted, isBlocked } from "../brand/allowlist";
import { suspiciousScore, SUSPICIOUS_THRESHOLD } from "../brand/scoring";

/**
 * Apply all filter predicates to a product and return the display result.
 * Predicates are ordered for performance (cheapest checks first).
 */
export async function applyFilters(
  product: Product,
  state: FilterState,
): Promise<FilterResult> {
  // P0: Sponsored
  if (state.hideSponsored && product.isSponsored) {
    return "hide";
  }

  // P1: Keyword exclusion
  if (matchesExcludeTokens(product, state.excludeTokens)) {
    return "hide";
  }

  // P1b: Excluded brands (set via sidebar ✕ buttons)
  if (matchesExcludedBrands(product, state.excludedBrands)) {
    return "hide";
  }

  // P2: Minimum reviews
  if (product.reviewCount < state.minReviews) {
    return "hide";
  }

  // P3: Minimum rating (use adjusted rating if categories are being ignored)
  if (state.minRating !== null && product.rating > 0) {
    const effectiveRating =
      product.adjustedRating !== undefined && state.ignoredCategories.length > 0
        ? product.adjustedRating
        : product.rating;
    if (effectiveRating < state.minRating) {
      return "hide";
    }
  }

  // P4: Price range
  if (product.price !== null) {
    if (state.priceMin !== null && product.price < state.priceMin) {
      return "hide";
    }
    if (state.priceMax !== null && product.price > state.priceMax) {
      return "hide";
    }
  }

  // P5: Brand mode
  const brandResult = await applyBrandFilter(product, state.brandMode);
  if (brandResult !== "show") return brandResult;

  // P5b: Seller filter (only applies when seller info is available)
  if (state.sellerFilter !== "any" && product.seller) {
    if (!matchesSellerFilter(product, state.sellerFilter)) {
      return "hide";
    }
  }

  // P6: Review quality (only if score has been computed and threshold is set)
  if (
    state.minReviewQuality > 0 &&
    product.reviewQuality !== undefined &&
    product.reviewQuality < state.minReviewQuality
  ) {
    return "hide";
  }

  // P7: Country of Origin filter
  if (matchesOriginFilter(product, state) === false) {
    return "hide";
  }

  return "show";
}

/**
 * Check if product title or brand matches any excluded tokens.
 * Supports quoted phrases and individual tokens.
 */
function matchesExcludeTokens(product: Product, tokens: string[]): boolean {
  if (tokens.length === 0) return false;

  const searchText =
    `${product.title} ${product.brand}`.toLowerCase();

  for (const token of tokens) {
    const normalized = token.trim().toLowerCase();
    if (normalized.length === 0) continue;
    if (searchText.includes(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if product brand matches any excluded brand names.
 * Uses case-insensitive exact match on the brand field.
 */
function matchesExcludedBrands(product: Product, brands: string[]): boolean {
  if (!brands || brands.length === 0) return false;
  const productBrand = product.brand?.toLowerCase();
  if (!productBrand) return false;
  return brands.some((b) => productBrand.includes(b.toLowerCase()));
}

/**
 * Check if product seller info matches the selected seller filter.
 */
function matchesSellerFilter(
  product: Product,
  filter: FilterState["sellerFilter"],
): boolean {
  if (!product.seller) return true; // no info → don't filter
  const f = product.seller.fulfillment;

  switch (filter) {
    case "amazon":
      return f === "amazon";
    case "fba":
      return f === "amazon" || f === "fba";
    case "third-party":
      return f === "third-party";
    default:
      return true;
  }
}

/**
 * Apply brand filtering mode.
 */
async function applyBrandFilter(
  product: Product,
  mode: FilterState["brandMode"],
): Promise<FilterResult> {
  if (mode === "off") return "show";

  const brand = product.brand;
  if (!brand) return mode === "trusted-only" ? "hide" : "show";

  // Check if user has explicitly blocked this brand
  const blocked = await isBlocked(brand);
  if (blocked) return "hide";

  // Check if brand is in allowlist
  const trusted = isAllowlisted(brand);

  switch (mode) {
    case "trusted-only":
      return trusted ? "show" : "hide";

    case "hide": {
      if (trusted) return "show";
      const score = suspiciousScore(brand);
      return score >= SUSPICIOUS_THRESHOLD ? "hide" : "show";
    }

    case "dim": {
      if (trusted) return "show";
      return "dim";
    }

    default:
      return "show";
  }
}

/**
 * Apply the filter result to a product card's DOM element.
 */
export function applyFilterResult(
  element: HTMLElement,
  result: FilterResult,
): void {
  // Reset all filter classes
  element.classList.remove(
    "bas-hidden",
    "bas-dimmed",
    "bas-trusted",
  );
  element.style.removeProperty("display");

  switch (result) {
    case "hide":
      element.classList.add("bas-hidden");
      element.style.display = "none";
      break;
    case "dim":
      element.classList.add("bas-dimmed");
      break;
    case "show":
      break;
  }
}

/**
 * Mark a product card as having a trusted brand.
 */
export function markTrusted(element: HTMLElement): void {
  element.classList.add("bas-trusted");
}

/**
 * Check if product passes the Country of Origin filter.
 * Returns true if it should be shown, false if it should be hidden.
 */
function matchesOriginFilter(product: Product, state: FilterState): boolean {
  const hasFilter = state.originInclude.length > 0 || state.originExclude.length > 0 || state.hideUnknownOrigin;
  if (!hasFilter) return true;

  const origin = product.countryOfOrigin?.toLowerCase();

  // If no origin data and hideUnknownOrigin is set, hide it
  if (!origin) return !state.hideUnknownOrigin;

  // Check exclude list first
  if (state.originExclude.length > 0) {
    if (state.originExclude.some((c) => origin.includes(c.toLowerCase()))) {
      return false;
    }
  }

  // Check include list (if set, only allow listed countries)
  if (state.originInclude.length > 0) {
    return state.originInclude.some((c) => origin.includes(c.toLowerCase()));
  }

  return true;
}
