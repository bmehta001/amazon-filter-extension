/**
 * Feature gate — maps features to their required tier and provides
 * a simple check function. Used throughout the content script and
 * popup to conditionally enable premium functionality.
 */

import type { LicenseTier } from "./license";

// ── Feature IDs ──────────────────────────────────────────────────────

/** All features that can be gated behind a tier. */
export type FeatureId =
  | "ml-review-analysis"
  | "deal-scoring"
  | "trust-scores"
  | "seller-trust"
  | "listing-integrity"
  | "listing-completeness"
  | "compare-tray"
  | "export"
  | "watchlist"
  | "price-sparklines"
  | "bsr-extraction"
  | "recall-safety"
  | "advanced-search"
  | "review-detail-panel"
  | "category-weights"
  | "review-gallery"
  | "unlimited-shortlists"
  | "savings-breakdown";

// ── Tier Map ─────────────────────────────────────────────────────────

/**
 * Maps each feature to the minimum tier required.
 * "free" = available to everyone. "pro" = requires paid license.
 */
const TIER_MAP: Record<FeatureId, LicenseTier> = {
  // Free features (drive installs & reviews)
  // Basic filters, hide sponsored, simple review grade, sparkline link — are NOT gated
  // (they're handled by not appearing in this map as checks)

  // Premium features
  "ml-review-analysis": "pro",
  "deal-scoring": "pro",
  "trust-scores": "pro",
  "seller-trust": "pro",
  "listing-integrity": "pro",
  "listing-completeness": "pro",
  "compare-tray": "pro",
  "export": "pro",
  "watchlist": "pro",
  "price-sparklines": "pro",
  "bsr-extraction": "pro",
  "recall-safety": "pro",
  "advanced-search": "pro",
  "review-detail-panel": "pro",
  "category-weights": "pro",
  "review-gallery": "pro",
  "unlimited-shortlists": "pro",
  "savings-breakdown": "pro",
};

// ── Gate Check ───────────────────────────────────────────────────────

/** Get the required tier for a feature. */
export function getRequiredTier(feature: FeatureId): LicenseTier {
  return TIER_MAP[feature];
}

/**
 * Check if a feature is available for the given tier.
 * Use with the cached tier from `loadLicense()` — don't call
 * `isPro()` per-feature (too many storage reads).
 */
export function isFeatureAvailable(feature: FeatureId, currentTier: LicenseTier): boolean {
  const required = TIER_MAP[feature];
  if (required === "free") return true;
  return currentTier === "pro";
}

/**
 * Get a contextual teaser message for a locked feature.
 * Used to show "Pro would have caught this" hints to free users.
 */
export function getFeatureTeaser(feature: FeatureId): string {
  const teasers: Record<FeatureId, string> = {
    "ml-review-analysis": "AI detected review patterns on this product",
    "deal-scoring": "Deal analysis available for this product",
    "trust-scores": "Trust analysis found signals on this product",
    "seller-trust": "Seller trust data available",
    "listing-integrity": "Listing integrity check complete",
    "listing-completeness": "Listing quality audit available",
    "compare-tray": "Compare products side-by-side",
    "export": "Export your research to CSV/JSON",
    "watchlist": "Track this price and get alerts",
    "price-sparklines": "Price history trend available",
    "bsr-extraction": "Best Sellers Rank data available",
    "recall-safety": "Safety recall check available",
    "advanced-search": "Advanced search filters available",
    "review-detail-panel": "Detailed review breakdown available",
    "category-weights": "Category-optimized scoring available",
    "review-gallery": "Customer photos available",
    "unlimited-shortlists": "Save to unlimited shortlists",
    "savings-breakdown": "Detailed savings breakdown available",
  };
  return teasers[feature];
}

/**
 * Get all features available for a given tier.
 */
export function getAvailableFeatures(tier: LicenseTier): FeatureId[] {
  return (Object.entries(TIER_MAP) as [FeatureId, LicenseTier][])
    .filter(([, required]) => required === "free" || tier === "pro")
    .map(([id]) => id);
}

/**
 * Get all features that are locked for a given tier.
 */
export function getLockedFeatures(tier: LicenseTier): FeatureId[] {
  if (tier === "pro") return [];
  return (Object.entries(TIER_MAP) as [FeatureId, LicenseTier][])
    .filter(([, required]) => required === "pro")
    .map(([id]) => id);
}

/** Human-readable label for a feature. */
export function getFeatureLabel(feature: FeatureId): string {
  const labels: Record<FeatureId, string> = {
    "ml-review-analysis": "AI Review Analysis",
    "deal-scoring": "Deal Quality Scoring",
    "trust-scores": "Review Trust Analysis",
    "seller-trust": "Seller Trust Analysis",
    "listing-integrity": "Listing Integrity Check",
    "listing-completeness": "Listing Quality Audit",
    "compare-tray": "Product Comparison",
    "export": "CSV/JSON Export",
    "watchlist": "Price Watchlist & Alerts",
    "price-sparklines": "Price Trend Charts",
    "bsr-extraction": "Best Sellers Rank",
    "recall-safety": "Recall Safety Matching",
    "advanced-search": "Advanced Search Builder",
    "review-detail-panel": "Detailed Review Insights",
    "category-weights": "Category-Specific Scoring",
    "review-gallery": "Review Photo Gallery",
    "unlimited-shortlists": "Unlimited Shortlists",
    "savings-breakdown": "Savings Stack Breakdown",
  };
  return labels[feature];
}
