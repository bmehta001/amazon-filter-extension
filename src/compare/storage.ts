/**
 * Cross-search comparison storage — persists pinned products in
 * chrome.storage.session so they survive page navigations but
 * clear when the browser session ends.
 */

/** A product pinned for comparison. */
export interface CompareItem {
  asin: string;
  title: string;
  brand: string;
  price: number | null;
  rating: number;
  reviewCount: number;
  url: string;
  pinnedAt: number;
  searchQuery: string;
  /** Optional enrichment data captured at pin time. */
  reviewQuality?: number;
  trustScore?: number;
  sellerTrust?: number;
  dealScore?: number;
  seller?: string;
}

const STORAGE_KEY = "bas_compare";
const MAX_COMPARE_ITEMS = 20;

/** Listeners notified when the compare list changes. */
type ChangeListener = (items: CompareItem[]) => void;
const listeners: ChangeListener[] = [];

/** In-memory cache for fast reads. */
let cache: CompareItem[] | null = null;

/** Register a callback for compare list changes. */
export function onCompareChange(fn: ChangeListener): void {
  listeners.push(fn);
}

function notifyListeners(items: CompareItem[]): void {
  for (const fn of listeners) {
    try { fn(items); } catch { /* ignore */ }
  }
}

/** Load compare items from chrome.storage.session. */
export async function loadCompareItems(): Promise<CompareItem[]> {
  if (cache !== null) return cache;
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.storage?.session) {
      cache = [];
      resolve([]);
      return;
    }
    chrome.storage.session.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        console.warn("[BAS] Compare load error:", chrome.runtime.lastError.message);
        cache = [];
        resolve([]);
        return;
      }
      cache = (result[STORAGE_KEY] as CompareItem[]) || [];
      resolve(cache);
    });
  });
}

/** Save compare items to chrome.storage.session. */
async function saveCompareItems(items: CompareItem[]): Promise<void> {
  cache = items;
  notifyListeners(items);
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.storage?.session) {
      resolve();
      return;
    }
    chrome.storage.session.set({ [STORAGE_KEY]: items }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/** Add a product to the comparison set. Skips if ASIN already present. */
export async function addToCompare(item: CompareItem): Promise<boolean> {
  const items = await loadCompareItems();
  if (items.some((i) => i.asin === item.asin)) return false;
  if (items.length >= MAX_COMPARE_ITEMS) return false;
  items.push(item);
  await saveCompareItems(items);
  return true;
}

/** Remove a product from the comparison set by ASIN. */
export async function removeFromCompare(asin: string): Promise<void> {
  const items = await loadCompareItems();
  const filtered = items.filter((i) => i.asin !== asin);
  await saveCompareItems(filtered);
}

/** Clear all comparison items. */
export async function clearCompare(): Promise<void> {
  await saveCompareItems([]);
}

/** Check if a product is in the comparison set. */
export async function isInCompare(asin: string): Promise<boolean> {
  const items = await loadCompareItems();
  return items.some((i) => i.asin === asin);
}

/** Reset in-memory cache (for testing or soft-nav cleanup). */
export function resetCompareCache(): void {
  cache = null;
}
