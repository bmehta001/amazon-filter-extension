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
}

/** Brand filtering mode. */
export type BrandMode = "off" | "dim" | "hide" | "trusted-only";

/** Current state of all user-configurable filters. */
export interface FilterState {
  minReviews: number;
  minRating: number | null;
  priceMin: number | null;
  priceMax: number | null;
  excludeTokens: string[];
  brandMode: BrandMode;
  hideSponsored: boolean;
  queryBuilder: boolean;
  minReviewQuality: number;
  useMLAnalysis: boolean;
  ignoredCategories: string[];
  dedupCategories: string[];
  targetResultCount: number;  // desired number of items to display (50 = 1 page, up to 500)
}

/** Shape of data stored in chrome.storage.sync. */
export interface StorageData {
  filters: FilterState;
  trustedBrands: string[];
  blockedBrands: string[];
}

/** Result of applying filters to a product. */
export type FilterResult = "show" | "hide" | "dim";

/** Default filter state. */
export const DEFAULT_FILTERS: FilterState = {
  minReviews: 0,
  minRating: null,
  priceMin: null,
  priceMax: null,
  excludeTokens: [],
  brandMode: "off",
  hideSponsored: false,
  queryBuilder: false,
  minReviewQuality: 0,
  useMLAnalysis: false,
  ignoredCategories: [],
  dedupCategories: [],
  targetResultCount: 50,
};

/** Default storage data. */
export const DEFAULT_STORAGE: StorageData = {
  filters: { ...DEFAULT_FILTERS },
  trustedBrands: [],
  blockedBrands: [],
};
