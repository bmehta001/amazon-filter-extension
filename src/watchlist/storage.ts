/**
 * Price drop watchlist — persists watched products in chrome.storage.sync
 * and provides CRUD operations for the background service worker and popup.
 */

const ALLOWED_DOMAINS = new Set([
  "www.amazon.com", "www.amazon.co.uk", "www.amazon.ca",
  "www.amazon.de", "www.amazon.fr", "www.amazon.it",
  "www.amazon.es", "www.amazon.in", "www.amazon.co.jp",
  "www.amazon.com.au",
]);

/** Validate and sanitize a domain. Returns a safe Amazon domain. */
function validateDomain(domain: string): string {
  return ALLOWED_DOMAINS.has(domain) ? domain : "www.amazon.com";
}

/** Validate ASIN format (10 alphanumeric characters). */
function validateAsin(asin: string): boolean {
  return /^[A-Z0-9]{10}$/i.test(asin);
}

/** A single price snapshot recorded during a background check. */
export interface PriceSnapshot {
  price: number;
  checkedAt: string;
}

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
  /** Rolling price history (most recent last). Max MAX_PRICE_HISTORY entries. */
  priceHistory?: PriceSnapshot[];
  /** Consecutive fetch failures (for backoff). Reset on success. */
  consecutiveFailures?: number;
}

const STORAGE_KEY = "bas_watchlist";
const MAX_WATCHLIST_ITEMS = 50;
export const MAX_PRICE_HISTORY = 30;

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
    domain: validateDomain(domain),
    priceHistory: [{ price: currentPrice, checkedAt: now }],
    consecutiveFailures: 0,
  });

  await saveWatchlist(items);
}

/** Remove a product from the watchlist by ASIN. */
export async function removeFromWatchlist(asin: string): Promise<void> {
  const items = await loadWatchlist();
  await saveWatchlist(items.filter((item) => item.asin !== asin));
}

/** Update the last known price for a watched item and record in history. */
export async function updateWatchlistPrice(
  asin: string,
  newPrice: number,
): Promise<WatchlistItem | null> {
  const items = await loadWatchlist();
  const item = items.find((i) => i.asin === asin);
  if (!item) return null;

  const now = new Date().toISOString();
  item.lastKnownPrice = newPrice;
  item.lastCheckedAt = now;
  item.consecutiveFailures = 0;

  // Append to price history (trim to MAX_PRICE_HISTORY)
  if (!item.priceHistory) item.priceHistory = [];
  item.priceHistory.push({ price: newPrice, checkedAt: now });
  if (item.priceHistory.length > MAX_PRICE_HISTORY) {
    item.priceHistory = item.priceHistory.slice(-MAX_PRICE_HISTORY);
  }

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

/** Update the target price for a watched item. */
export async function updateTargetPrice(
  asin: string,
  newTarget: number,
): Promise<WatchlistItem | null> {
  const items = await loadWatchlist();
  const item = items.find((i) => i.asin === asin);
  if (!item) return null;

  item.targetPrice = newTarget;
  await saveWatchlist(items);
  return item;
}

/** Increment consecutive failure count for backoff logic. */
export async function incrementFailures(asin: string): Promise<number> {
  const items = await loadWatchlist();
  const item = items.find((i) => i.asin === asin);
  if (!item) return 0;

  item.consecutiveFailures = (item.consecutiveFailures || 0) + 1;
  await saveWatchlist(items);
  return item.consecutiveFailures;
}

// ── Notification preferences ─────────────────────────────────────────

const NOTIF_PREFS_KEY = "bas_notification_prefs";

export interface NotificationPreferences {
  /** Master toggle — if false, no notifications are sent. */
  enabled: boolean;
  /** Quiet hours (24h format). Notifications suppressed between start and end. */
  quietHoursStart: number; // 0-23
  quietHoursEnd: number;   // 0-23
  /** Check frequency in minutes. Default 360 (6h). */
  checkIntervalMinutes: number;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  enabled: true,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  checkIntervalMinutes: 360,
};

export async function loadNotificationPrefs(): Promise<NotificationPreferences> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(NOTIF_PREFS_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve({ ...DEFAULT_NOTIFICATION_PREFS });
        return;
      }
      const stored = result[NOTIF_PREFS_KEY] as Partial<NotificationPreferences> | undefined;
      resolve({ ...DEFAULT_NOTIFICATION_PREFS, ...stored });
    });
  });
}

export async function saveNotificationPrefs(prefs: NotificationPreferences): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [NOTIF_PREFS_KEY]: prefs }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}
