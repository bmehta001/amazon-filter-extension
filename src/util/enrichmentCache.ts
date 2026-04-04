/**
 * Enrichment cache — persists ASIN-keyed enrichment data to sessionStorage
 * so it survives page navigations (e.g., clicking a product and pressing Back).
 *
 * Uses sessionStorage (per-tab, sync API, 5MB limit). Each map is stored as a
 * JSON blob with a timestamp for TTL expiration.
 */

import type { ReviewScore, ProductInsights, ProductReviewData, ReviewMediaGallery } from "../review/types";
import type { ListingCompleteness } from "../listing/completeness";
import type { TrustScoreResult } from "../review/trustScore";
import type { SellerTrustResult } from "../seller/trust";
import type { ListingIntegrityResult } from "../seller/listingSignals";
import type { ReviewSummary } from "../review/summary";
import type { SellerInfo, MultiBuyOffer, BsrInfo } from "../types";

const CACHE_PREFIX = "bas-ec-";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES_PER_MAP = 1000;

interface CacheEntry<T> {
  /** Timestamp when this cache entry was written. */
  ts: number;
  /** Serialized map data keyed by ASIN. */
  data: Record<string, T>;
}

/** All enrichment map names that we cache. */
const MAP_KEYS = [
  "reviewScoreMap",
  "productInsightsMap",
  "reviewDataMap",
  "brandMap",
  "sellerMap",
  "originMap",
  "trustScoreMap",
  "sellerTrustMap",
  "listingIntegrityMap",
  "dealScoreExportMap",
  "reviewSummaryMap",
  "multiBuyMap",
  "bsrMap",
  "reviewMediaMap",
  "listingCompletenessMap",
] as const;

type MapKey = (typeof MAP_KEYS)[number];

/**
 * Save a single Map to chrome.storage.session with a timestamp.
 * Uses chrome.storage.session instead of sessionStorage to prevent
 * Amazon's JavaScript from reading our cached analysis data.
 * Trims to MAX_ENTRIES_PER_MAP most recent entries if over limit.
 */
export function saveMapToCache<T>(key: string, map: Map<string, T>): void {
  if (map.size === 0) return;

  let data: Record<string, T>;
  if (map.size > MAX_ENTRIES_PER_MAP) {
    const entries = [...map.entries()].slice(-MAX_ENTRIES_PER_MAP);
    data = Object.fromEntries(entries);
  } else {
    data = Object.fromEntries(map);
  }

  const entry: CacheEntry<T> = { ts: Date.now(), data };

  try {
    chrome.storage.session.set({ [CACHE_PREFIX + key]: entry });
  } catch {
    // Storage error — skip caching
  }
}

/**
 * Load a single Map from chrome.storage.session. Returns empty Map if
 * missing, expired, or corrupted. Synchronous wrapper using cached data.
 */
export function loadMapFromCache<T>(key: string): Map<string, T> {
  // Use the synchronously-loaded cache snapshot
  const entry = sessionCacheSnapshot[CACHE_PREFIX + key] as CacheEntry<T> | undefined;
  if (!entry) return new Map();

  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    chrome.storage.session.remove(CACHE_PREFIX + key);
    return new Map();
  }

  try {
    return new Map(Object.entries(entry.data) as [string, T][]);
  } catch {
    return new Map();
  }
}

/**
 * Pre-load all session cache entries for synchronous access.
 * Call once on init before restoreAllEnrichment().
 */
let sessionCacheSnapshot: Record<string, unknown> = {};
export async function preloadSessionCache(): Promise<void> {
  const keys = MAP_KEYS.map((k) => CACHE_PREFIX + k);
  return new Promise((resolve) => {
    try {
      chrome.storage.session.get(keys, (result) => {
        sessionCacheSnapshot = result ?? {};
        resolve();
      });
    } catch {
      resolve(); // Graceful fallback — empty cache
    }
  });
}

/** Shape returned by restoreAllEnrichment(). */
export interface EnrichmentCacheMaps {
  reviewScoreMap: Map<string, ReviewScore>;
  productInsightsMap: Map<string, ProductInsights>;
  reviewDataMap: Map<string, ProductReviewData>;
  brandMap: Map<string, string>;
  sellerMap: Map<string, SellerInfo>;
  originMap: Map<string, string>;
  trustScoreMap: Map<string, TrustScoreResult>;
  sellerTrustMap: Map<string, SellerTrustResult>;
  listingIntegrityMap: Map<string, ListingIntegrityResult>;
  dealScoreExportMap: Map<string, number>;
  reviewSummaryMap: Map<string, ReviewSummary>;
  multiBuyMap: Map<string, MultiBuyOffer>;
  bsrMap: Map<string, BsrInfo>;
  reviewMediaMap: Map<string, ReviewMediaGallery>;
  listingCompletenessMap: Map<string, ListingCompleteness>;
}

/** Bulk save all enrichment maps to sessionStorage. */
export function saveAllEnrichment(maps: EnrichmentCacheMaps): void {
  saveMapToCache("reviewScoreMap", maps.reviewScoreMap);
  saveMapToCache("productInsightsMap", maps.productInsightsMap);
  saveMapToCache("reviewDataMap", maps.reviewDataMap);
  saveMapToCache("brandMap", maps.brandMap);
  saveMapToCache("sellerMap", maps.sellerMap);
  saveMapToCache("originMap", maps.originMap);
  saveMapToCache("trustScoreMap", maps.trustScoreMap);
  saveMapToCache("sellerTrustMap", maps.sellerTrustMap);
  saveMapToCache("listingIntegrityMap", maps.listingIntegrityMap);
  saveMapToCache("dealScoreExportMap", maps.dealScoreExportMap);
  saveMapToCache("reviewSummaryMap", maps.reviewSummaryMap);
  saveMapToCache("multiBuyMap", maps.multiBuyMap);
  saveMapToCache("bsrMap", maps.bsrMap);
  saveMapToCache("reviewMediaMap", maps.reviewMediaMap);
  saveMapToCache("listingCompletenessMap", maps.listingCompletenessMap);
}

/** Bulk load all enrichment maps from sessionStorage. */
export function restoreAllEnrichment(): EnrichmentCacheMaps {
  return {
    reviewScoreMap: loadMapFromCache<ReviewScore>("reviewScoreMap"),
    productInsightsMap: loadMapFromCache<ProductInsights>("productInsightsMap"),
    reviewDataMap: loadMapFromCache<ProductReviewData>("reviewDataMap"),
    brandMap: loadMapFromCache<string>("brandMap"),
    sellerMap: loadMapFromCache<SellerInfo>("sellerMap"),
    originMap: loadMapFromCache<string>("originMap"),
    trustScoreMap: loadMapFromCache<TrustScoreResult>("trustScoreMap"),
    sellerTrustMap: loadMapFromCache<SellerTrustResult>("sellerTrustMap"),
    listingIntegrityMap: loadMapFromCache<ListingIntegrityResult>("listingIntegrityMap"),
    dealScoreExportMap: loadMapFromCache<number>("dealScoreExportMap"),
    reviewSummaryMap: loadMapFromCache<ReviewSummary>("reviewSummaryMap"),
    multiBuyMap: loadMapFromCache<MultiBuyOffer>("multiBuyMap"),
    bsrMap: loadMapFromCache<BsrInfo>("bsrMap"),
    reviewMediaMap: loadMapFromCache<ReviewMediaGallery>("reviewMediaMap"),
    listingCompletenessMap: loadMapFromCache<ListingCompleteness>("listingCompletenessMap"),
  };
}

/** Remove all enrichment cache entries from chrome.storage.session. */
export function clearEnrichmentCache(): void {
  const keys = MAP_KEYS.map((k) => CACHE_PREFIX + k);
  try {
    chrome.storage.session.remove(keys);
  } catch { /* ignore */ }
  sessionCacheSnapshot = {};
}
