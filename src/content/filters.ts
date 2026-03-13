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

  // P2: Minimum reviews
  if (product.reviewCount < state.minReviews) {
    return "hide";
  }

  // P3: Minimum rating
  if (state.minRating !== null && product.rating > 0 && product.rating < state.minRating) {
    return "hide";
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

  // P6: Review quality (only if score has been computed and threshold is set)
  if (
    state.minReviewQuality > 0 &&
    product.reviewQuality !== undefined &&
    product.reviewQuality < state.minReviewQuality
  ) {
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
