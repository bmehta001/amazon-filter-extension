/**
 * Price drop watchlist — persists watched products in chrome.storage.sync
 * and provides CRUD operations for the background service worker and popup.
 */

/** A single item in the price watchlist. */
export interface WatchlistItem {
  /** Amazon ASIN. */
  asin: string;
  /** Product title (for display). */
  title: string;
  /** Price when the user added it to watchlist. */
  priceWhenAdded: number;
  /** User's target price for alerts. */
  targetPrice: number;
  /** Last known price (updated by background checks). */
  lastKnownPrice: number;
  /** ISO timestamp of when this item was added. */
  addedAt: string;
  /** ISO timestamp of last price check. */
  lastCheckedAt: string;
  /** Amazon domain (e.g., "www.amazon.com"). */
  domain: string;
}

const STORAGE_KEY = "bas_watchlist";
const MAX_WATCHLIST_ITEMS = 50;

/** Load the full watchlist from chrome.storage.sync. */
export async function loadWatchlist(): Promise<WatchlistItem[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        console.error("[BAS] Watchlist load error:", chrome.runtime.lastError.message);
        resolve([]);
        return;
      }
      resolve((result[STORAGE_KEY] as WatchlistItem[]) || []);
    });
  });
}

/** Save the full watchlist to chrome.storage.sync. */
async function saveWatchlist(items: WatchlistItem[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: items }, () => {
      if (chrome.runtime.lastError) {
        console.error("[BAS] Watchlist save error:", chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/** Add a product to the watchlist. */
export async function addToWatchlist(
  asin: string,
  title: string,
  currentPrice: number,
  targetPrice: number,
  domain: string = "www.amazon.com",
): Promise<void> {
  const items = await loadWatchlist();

  // Don't add duplicates
  if (items.some((item) => item.asin === asin)) return;

  // Enforce max items
  if (items.length >= MAX_WATCHLIST_ITEMS) {
    items.shift(); // Remove oldest
  }

  const now = new Date().toISOString();
  items.push({
    asin,
    title: title.slice(0, 120), // Truncate for storage limits
    priceWhenAdded: currentPrice,
    targetPrice,
    lastKnownPrice: currentPrice,
    addedAt: now,
    lastCheckedAt: now,
    domain,
  });

  await saveWatchlist(items);
}

/** Remove a product from the watchlist by ASIN. */
export async function removeFromWatchlist(asin: string): Promise<void> {
  const items = await loadWatchlist();
  await saveWatchlist(items.filter((item) => item.asin !== asin));
}

/** Update the last known price for a watched item. */
export async function updateWatchlistPrice(
  asin: string,
  newPrice: number,
): Promise<WatchlistItem | null> {
  const items = await loadWatchlist();
  const item = items.find((i) => i.asin === asin);
  if (!item) return null;

  item.lastKnownPrice = newPrice;
  item.lastCheckedAt = new Date().toISOString();
  await saveWatchlist(items);
  return item;
}

/** Check if an ASIN is on the watchlist. */
export async function isWatched(asin: string): Promise<boolean> {
  const items = await loadWatchlist();
  return items.some((item) => item.asin === asin);
}

/** Get a single watchlist item by ASIN. */
export async function getWatchlistItem(asin: string): Promise<WatchlistItem | null> {
  const items = await loadWatchlist();
  return items.find((item) => item.asin === asin) || null;
}
