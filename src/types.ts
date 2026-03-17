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
};
