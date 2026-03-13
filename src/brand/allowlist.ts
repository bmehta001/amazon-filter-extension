import { loadBrandLists } from "../util/storage";

const ALLOWLIST_STORAGE_KEY = "brandAllowlist";
const ALLOWLIST_URL =
  "https://raw.githubusercontent.com/chris-mosley/AmazonBrandFilterList/main/brands.txt";

/** In-memory allowlist set (lowercase). */
let allowlistSet: Set<string> = new Set();
/** Whether the allowlist has been loaded. */
let loaded = false;

/**
 * Initialize the brand allowlist by loading from:
 * 1. chrome.storage.local cache (fast)
 * 2. Bundled brands.txt fallback
 * Merges with user-trusted brands from chrome.storage.sync.
 */
export async function initAllowlist(): Promise<void> {
  // Try cached allowlist first
  const cached = await loadCachedAllowlist();
  if (cached && cached.length > 0) {
    allowlistSet = new Set(cached.map((b) => b.toLowerCase()));
  } else {
    // Load from bundled file
    await loadBundledAllowlist();
  }

  // Merge user-trusted brands
  const { trusted } = await loadBrandLists();
  for (const brand of trusted) {
    allowlistSet.add(brand.toLowerCase());
  }
  loaded = true;
}

/** Check if a brand is in the allowlist (exact or prefix match). */
export function isAllowlisted(brand: string): boolean {
  if (!loaded) return false; // Fail open until loaded
  const lower = brand.trim().toLowerCase();
  if (!lower || lower === "unknown") return false;
  // Exact match
  if (allowlistSet.has(lower)) return true;
  // Check if the extracted brand starts with or contains an allowlisted brand
  // e.g., "Philips Audio" matches "philips", "JBL Professional" matches "jbl"
  for (const entry of allowlistSet) {
    if (entry.length >= 3 && (lower.startsWith(entry + " ") || lower.startsWith(entry + "-"))) {
      return true;
    }
    // Also check if an allowlist entry starts with the extracted brand
    // e.g., extracted "Philips" should match "philips hue" in the allowlist
    if (lower.length >= 3 && entry.startsWith(lower + " ")) {
      return true;
    }
  }
  return false;
}

/** Check if a brand is explicitly blocked by the user. */
export async function isBlocked(brand: string): Promise<boolean> {
  const { blocked } = await loadBrandLists();
  return blocked.map((b) => b.toLowerCase()).includes(brand.trim().toLowerCase());
}

/** Get the full allowlist for display/debugging. */
export function getAllowlist(): string[] {
  return Array.from(allowlistSet);
}

/** Get the count of brands in the allowlist. */
export function getAllowlistCount(): number {
  return allowlistSet.size;
}

/**
 * Refresh the allowlist from the remote URL.
 * Called by the service worker on a daily schedule.
 */
export async function refreshAllowlistFromRemote(): Promise<boolean> {
  try {
    const response = await fetch(ALLOWLIST_URL);
    if (!response.ok) return false;
    const text = await response.text();
    const brands = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    await cacheBrandsList(brands);
    allowlistSet = new Set(brands.map((b) => b.toLowerCase()));
    // Re-merge user trusted brands
    const { trusted } = await loadBrandLists();
    for (const brand of trusted) {
      allowlistSet.add(brand.toLowerCase());
    }
    loaded = true;
    return true;
  } catch {
    return false;
  }
}

// ── Private helpers ──────────────────────────────────────────────────

async function loadCachedAllowlist(): Promise<string[] | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(ALLOWLIST_STORAGE_KEY, (result) => {
      const data = result[ALLOWLIST_STORAGE_KEY];
      if (Array.isArray(data)) {
        resolve(data as string[]);
      } else {
        resolve(null);
      }
    });
  });
}

async function cacheBrandsList(brands: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [ALLOWLIST_STORAGE_KEY]: brands }, resolve);
  });
}

async function loadBundledAllowlist(): Promise<void> {
  try {
    const url = chrome.runtime.getURL("src/brand/brands.txt");
    const response = await fetch(url);
    const text = await response.text();
    const brands = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    allowlistSet = new Set(brands.map((b) => b.toLowerCase()));
    // Cache for future fast loading
    await cacheBrandsList(brands);
  } catch {
    // Silently fail — will just have an empty allowlist until remote refresh
    allowlistSet = new Set();
  }
}
