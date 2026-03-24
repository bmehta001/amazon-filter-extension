/**
 * Enrichment cache — persists ASIN-keyed enrichment data to sessionStorage
 * so it survives page navigations (e.g., clicking a product and pressing Back).
 *
 * Uses sessionStorage (per-tab, sync API, 5MB limit). Each map is stored as a
 * JSON blob with a timestamp for TTL expiration.
 */

import type { ReviewScore, ProductInsights, ProductReviewData } from "../review/types";
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
] as const;

type MapKey = (typeof MAP_KEYS)[number];

/**
 * Save a single Map to sessionStorage with a timestamp.
 * Trims to MAX_ENTRIES_PER_MAP most recent entries if over limit.
 */
export function saveMapToCache<T>(key: string, map: Map<string, T>): void {
  if (map.size === 0) return;

  let data: Record<string, T>;
  if (map.size > MAX_ENTRIES_PER_MAP) {
    // Keep only the last MAX_ENTRIES_PER_MAP entries (most recently added)
    const entries = [...map.entries()].slice(-MAX_ENTRIES_PER_MAP);
    data = Object.fromEntries(entries);
  } else {
    data = Object.fromEntries(map);
  }

  const entry: CacheEntry<T> = { ts: Date.now(), data };

  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded — clear expired entries and retry once
    clearExpiredEntries();
    try {
      sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Still full — skip caching for this map
    }
  }
}

/**
 * Load a single Map from sessionStorage. Returns empty Map if missing,
 * expired, or corrupted.
 */
export function loadMapFromCache<T>(key: string): Map<string, T> {
  const raw = sessionStorage.getItem(CACHE_PREFIX + key);
  if (!raw) return new Map();

  try {
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_PREFIX + key);
      return new Map();
    }
    return new Map(Object.entries(entry.data) as [string, T][]);
  } catch {
    sessionStorage.removeItem(CACHE_PREFIX + key);
    return new Map();
  }
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
  };
}

/** Remove all enrichment cache entries from sessionStorage. */
export function clearEnrichmentCache(): void {
  for (const key of MAP_KEYS) {
    sessionStorage.removeItem(CACHE_PREFIX + key);
  }
}

/** Remove cache entries that have exceeded the TTL. */
function clearExpiredEntries(): void {
  const now = Date.now();
  for (const key of MAP_KEYS) {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) continue;
    try {
      const entry: CacheEntry<unknown> = JSON.parse(raw);
      if (now - entry.ts > CACHE_TTL_MS) {
        sessionStorage.removeItem(CACHE_PREFIX + key);
      }
    } catch {
      sessionStorage.removeItem(CACHE_PREFIX + key);
    }
  }
}
