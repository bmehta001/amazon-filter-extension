import type { StorageData, FilterState } from "../types";
import { DEFAULT_STORAGE } from "../types";
import { debounce } from "./debounce";

/** Load all stored data, falling back to defaults. */
export async function loadStorage(): Promise<StorageData> {
  return new Promise((resolve, reject) => {
    const keys = Object.keys(DEFAULT_STORAGE) as (keyof StorageData)[];
    chrome.storage.sync.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        console.error("[BAS] Storage load error:", chrome.runtime.lastError.message);
        resolve(DEFAULT_STORAGE); // Fall back to defaults on error
        return;
      }
      resolve({
        ...DEFAULT_STORAGE,
        ...(result as Partial<StorageData>),
      } as StorageData);
    });
  });
}

/** Persist the full storage object with error handling. */
export async function saveStorage(data: Partial<StorageData>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) {
        console.error("[BAS] Storage save error:", chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/** Load just the filter state. */
export async function loadFilters(): Promise<FilterState> {
  const data = await loadStorage();
  return data.filters;
}

/**
 * Pending filter state waiting to be flushed to storage.
 * Null when no save is pending.
 */
let pendingFilters: FilterState | null = null;

/**
 * Debounced save implementation — coalesces rapid changes into one write.
 * The 300ms delay handles slider drags and rapid checkbox toggles.
 */
const debouncedSave = debounce(async () => {
  if (pendingFilters === null) return;
  const toSave = pendingFilters;
  pendingFilters = null;
  try {
    await saveStorage({ filters: toSave });
  } catch (err) {
    console.error("[BAS] Failed to save filters:", err);
  }
}, 300);

/**
 * Save filter state with debouncing.
 * Updates are coalesced: only the latest state is persisted.
 * Call flushPendingFilterSave() before page unload to ensure no data loss.
 */
export function saveFilters(filters: FilterState): void {
  pendingFilters = { ...filters };
  debouncedSave();
}

/**
 * Immediately flush any pending filter save (async version).
 * Use syncFlushPendingFilterSave() in beforeunload/visibilitychange handlers.
 */
export async function flushPendingFilterSave(): Promise<void> {
  if (pendingFilters === null) return;
  const toSave = pendingFilters;
  pendingFilters = null;
  try {
    await saveStorage({ filters: toSave });
  } catch (err) {
    console.error("[BAS] Failed to flush filters:", err);
  }
}

/**
 * Synchronously flush pending filter save (fire-and-forget).
 * Safe to call from beforeunload/visibilitychange where async won't complete.
 * Uses chrome.storage.sync.set() directly without awaiting the callback.
 */
export function syncFlushPendingFilterSave(): void {
  if (pendingFilters === null) return;
  const toSave = pendingFilters;
  pendingFilters = null;
  chrome.storage.sync.set({ filters: toSave }, () => {
    if (chrome.runtime.lastError) {
      console.error("[BAS] Failed to sync-flush filters:", chrome.runtime.lastError.message);
    }
  });
}

/** Check if there's a pending filter save. */
export function hasPendingSave(): boolean {
  return pendingFilters !== null;
}

/** Load user-managed brand lists. */
export async function loadBrandLists(): Promise<{
  trusted: string[];
  blocked: string[];
}> {
  const data = await loadStorage();
  return {
    trusted: data.trustedBrands,
    blocked: data.blockedBrands,
  };
}

/** Add a brand to the trusted list. */
export async function trustBrand(brand: string): Promise<void> {
  const data = await loadStorage();
  const normalized = brand.trim().toLowerCase();
  if (!data.trustedBrands.map((b) => b.toLowerCase()).includes(normalized)) {
    data.trustedBrands.push(brand.trim());
  }
  // Remove from blocked if present
  data.blockedBrands = data.blockedBrands.filter(
    (b) => b.toLowerCase() !== normalized,
  );
  await saveStorage({
    trustedBrands: data.trustedBrands,
    blockedBrands: data.blockedBrands,
  });
}

/** Add a brand to the blocked list. */
export async function blockBrand(brand: string): Promise<void> {
  const data = await loadStorage();
  const normalized = brand.trim().toLowerCase();
  if (!data.blockedBrands.map((b) => b.toLowerCase()).includes(normalized)) {
    data.blockedBrands.push(brand.trim());
  }
  // Remove from trusted if present
  data.trustedBrands = data.trustedBrands.filter(
    (b) => b.toLowerCase() !== normalized,
  );
  await saveStorage({
    trustedBrands: data.trustedBrands,
    blockedBrands: data.blockedBrands,
  });
}

/**
 * Listen for storage changes from other tabs/contexts.
 * Debounced to avoid DOM thrashing when multiple tabs save simultaneously.
 */
export function onFiltersChanged(
  callback: (filters: FilterState) => void,
): void {
  const debouncedCallback = debounce((filters: FilterState) => {
    callback(filters);
  }, 100);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.filters) {
      debouncedCallback(changes.filters.newValue as FilterState);
    }
  });
}
