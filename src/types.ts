/** Extracted data from a single Amazon product card DOM element. */
export interface Product {
  element: HTMLElement;
  title: string;
  reviewCount: number;
  rating: number;
  price: number | null;
  brand: string;
  isSponsored: boolean;
  asin: string | null;
  /** Review quality score (0-100), set asynchronously after fetch. */
  reviewQuality?: number;
  /** Rating recalculated after excluding ignored review categories. */
  adjustedRating?: number;
  /** True if the brand was confidently extracted from DOM/slug/title. */
  brandCertain?: boolean;
  /** Seller/fulfillment info, populated asynchronously from product detail page. */
  seller?: SellerInfo;
}

/** Seller information extracted from a product detail page. */
export interface SellerInfo {
  /** Name of the seller ("Amazon.com", "Third Party Name", etc.) */
  sellerName: string;
  /** Fulfillment type. */
  fulfillment: FulfillmentType;
}

/** How the product is fulfilled. */
export type FulfillmentType = "amazon" | "fba" | "third-party" | "unknown";

/** Brand filtering mode. */
export type BrandMode = "off" | "dim" | "hide" | "trusted-only";

/** Seller filter mode. */
export type SellerFilter = "any" | "amazon" | "fba" | "third-party";

/** Network usage mode for background data fetching. */
export type NetworkUsage = "full" | "minimal" | "auto";

/** Bandwidth preset that adjusts multiple preferences at once. */
export type BandwidthPreset = "high" | "balanced" | "low";

/**
 * Global preferences set via the extension popup.
 * These apply across all Amazon pages and control which features are active.
 */
export interface GlobalPreferences {
  /** Quick bandwidth preset — adjusting this sets multiple toggles at once. */
  bandwidthMode: BandwidthPreset;
  /** Show Keepa price history sparklines on search cards. */
  showSparklines: boolean;
  /** Show review trust badges (green/yellow/red) on search cards. */
  showReviewBadges: boolean;
  /** Pre-load product detail pages for brand/seller enrichment. */
  preloadDetails: boolean;
  /** Use ML-powered review analysis (heavier computation). */
  useMLAnalysis: boolean;
  /** Hide sponsored results by default on every search page. */
  hideSponsoredDefault: boolean;
  /** Default brand filtering mode for new searches. */
  defaultBrandMode: BrandMode;
  /** Default seller filter for new searches. */
  defaultSellerFilter: SellerFilter;
}

/** Current state of all user-configurable filters. */
export interface FilterState {
  minReviews: number;
  minRating: number | null;
  priceMin: number | null;
  priceMax: number | null;
  excludeTokens: string[];
  excludedBrands: string[];
  brandMode: BrandMode;
  hideSponsored: boolean;
  queryBuilder: boolean;
  minReviewQuality: number;
  useMLAnalysis: boolean;
  ignoredCategories: string[];
  dedupCategories: string[];
  totalPages: number;
  networkUsage: NetworkUsage;
  sellerFilter: SellerFilter;
}

/** Shape of data stored in chrome.storage.sync. */
export interface StorageData {
  filters: FilterState;
  trustedBrands: string[];
  blockedBrands: string[];
  preferences: GlobalPreferences;
}

/** Result of applying filters to a product. */
export type FilterResult = "show" | "hide" | "dim";

/** Default global preferences. */
export const DEFAULT_PREFERENCES: GlobalPreferences = {
  bandwidthMode: "balanced",
  showSparklines: true,
  showReviewBadges: true,
  preloadDetails: true,
  useMLAnalysis: false,
  hideSponsoredDefault: false,
  defaultBrandMode: "off",
  defaultSellerFilter: "any",
};

/**
 * Apply a bandwidth preset, returning updated preferences.
 * High: all features on. Low: minimal network usage. Balanced: sensible defaults.
 */
export function applyBandwidthPreset(
  prefs: GlobalPreferences,
  preset: BandwidthPreset,
): GlobalPreferences {
  switch (preset) {
    case "high":
      return {
        ...prefs,
        bandwidthMode: "high",
        showSparklines: true,
        showReviewBadges: true,
        preloadDetails: true,
        useMLAnalysis: true,
      };
    case "low":
      return {
        ...prefs,
        bandwidthMode: "low",
        showSparklines: false,
        showReviewBadges: false,
        preloadDetails: false,
        useMLAnalysis: false,
      };
    case "balanced":
      return {
        ...prefs,
        bandwidthMode: "balanced",
        showSparklines: true,
        showReviewBadges: true,
        preloadDetails: true,
        useMLAnalysis: false,
      };
  }
}

/** Default filter state. */
export const DEFAULT_FILTERS: FilterState = {
  minReviews: 0,
  minRating: null,
  priceMin: null,
  priceMax: null,
  excludeTokens: [],
  excludedBrands: [],
  brandMode: "off",
  hideSponsored: false,
  queryBuilder: false,
  minReviewQuality: 0,
  useMLAnalysis: false,
  ignoredCategories: [],
  dedupCategories: [],
  totalPages: 1,
  networkUsage: "auto",
  sellerFilter: "any",
};

/** Default storage data. */
export const DEFAULT_STORAGE: StorageData = {
  filters: { ...DEFAULT_FILTERS },
  trustedBrands: [],
  blockedBrands: [],
  preferences: { ...DEFAULT_PREFERENCES },
};
