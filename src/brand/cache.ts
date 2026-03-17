/**
 * ASIN → brand cache stored in chrome.storage.local.
 * Uses LRU eviction at MAX_ENTRIES and a 30-day TTL.
 */

const CACHE_KEY_PREFIX = "brand_";
const INDEX_KEY = "brand_cache_index";
const MAX_ENTRIES = 1000;
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

interface BrandCacheEntry {
  brand: string;
  cachedAt: number;
}

interface BrandCacheIndex {
  /** Ordered list of ASINs, most recently used last. */
  order: string[];
}

/**
 * Look up a cached brand for the given ASIN.
 * Returns null if not cached or expired.
 */
export async function getCachedBrand(asin: string): Promise<string | null> {
  const key = `${CACHE_KEY_PREFIX}${asin}`;

  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      const entry = result[key] as BrandCacheEntry | undefined;
      if (!entry || Date.now() - entry.cachedAt > CACHE_TTL) {
        resolve(null);
        return;
      }

      resolve(entry.brand);
    });
  });
}

/**
 * Store a brand for the given ASIN. Handles LRU eviction if the cache is full.
 */
export async function setCachedBrand(asin: string, brand: string): Promise<void> {
  const key = `${CACHE_KEY_PREFIX}${asin}`;
  const entry: BrandCacheEntry = { brand, cachedAt: Date.now() };

  // Update the LRU index
  const index = await getIndex();
  // Remove existing entry if present (will be re-added at end)
  const idx = index.order.indexOf(asin);
  if (idx !== -1) index.order.splice(idx, 1);
  index.order.push(asin);

  // Evict oldest entries if over limit
  const toRemove: string[] = [];
  while (index.order.length > MAX_ENTRIES) {
    const evicted = index.order.shift()!;
    toRemove.push(`${CACHE_KEY_PREFIX}${evicted}`);
  }

  return new Promise((resolve) => {
    const updates: Record<string, unknown> = {
      [key]: entry,
      [INDEX_KEY]: index,
    };

    chrome.storage.local.set(updates, () => {
      if (toRemove.length > 0) {
        chrome.storage.local.remove(toRemove, () => resolve());
      } else {
        resolve();
      }
    });
  });
}

async function getIndex(): Promise<BrandCacheIndex> {
  return new Promise((resolve) => {
    chrome.storage.local.get(INDEX_KEY, (result) => {
      if (chrome.runtime.lastError || !result[INDEX_KEY]) {
        resolve({ order: [] });
        return;
      }
      resolve(result[INDEX_KEY] as BrandCacheIndex);
    });
  });
}

/**
 * Clear all brand cache entries.
 */
export async function clearBrandCache(): Promise<void> {
  const all = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(null, (items) => {
      if (chrome.runtime.lastError) {
        resolve({});
        return;
      }
      resolve(items);
    });
  });

  const keys = Object.keys(all).filter(
    (k) => k.startsWith(CACHE_KEY_PREFIX) || k === INDEX_KEY,
  );

  if (keys.length === 0) return;

  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}
