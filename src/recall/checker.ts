/**
 * CPSC Recall Checker — searches the Consumer Product Safety Commission
 * public API and matches recalls against Amazon product titles.
 *
 * Strategy: One API call per search query (not per product). Cache results.
 * Then fuzzy-match each Amazon product against the cached recall list.
 */

import type { CpscRecall, RecallMatch, RecallCacheEntry } from "./types";

const CPSC_BASE = "https://www.saferproducts.gov/RestWebServices/Recall";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_CONFIDENCE = 0.3;

// In-memory cache (per page session — cleared on navigation)
const queryCache = new Map<string, RecallCacheEntry>();

// ── CPSC API ────────────────────────────────────────────────────────

/**
 * Fetch recalls from CPSC API by product name query.
 * Returns raw recall array. Throws on network error.
 */
export async function fetchRecalls(query: string): Promise<CpscRecall[]> {
  const cached = queryCache.get(query);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.recalls;
  }

  const url = `${CPSC_BASE}?ProductName=${encodeURIComponent(query)}&format=json`;

  // In MV3 extension, this runs via service worker message passing
  // or directly if we have host_permissions for saferproducts.gov
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CPSC API error: ${response.status}`);
  }

  const data: CpscRecall[] = await response.json();

  queryCache.set(query, { query, recalls: data, fetchedAt: Date.now() });
  return data;
}

/**
 * Fetch recalls via service worker message passing (for content scripts).
 */
export async function fetchRecallsViaServiceWorker(query: string): Promise<CpscRecall[]> {
  const cached = queryCache.get(query);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.recalls;
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "fetchRecalls", query },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        const recalls: CpscRecall[] = response?.recalls ?? [];
        queryCache.set(query, { query, recalls, fetchedAt: Date.now() });
        resolve(recalls);
      },
    );
  });
}

/** Clear the in-memory cache (call on soft navigation). */
export function clearRecallCache(): void {
  queryCache.clear();
}

// ── Matching Engine ─────────────────────────────────────────────────

/** Stop words to ignore when matching. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "in", "on", "of", "to",
  "is", "are", "was", "by", "at", "from", "as", "into", "this", "that",
  "it", "its", "new", "best", "top", "set", "pack", "pcs", "pcs.",
  "amazon", "com", "www",
]);

/**
 * Extract meaningful tokens from a product title for matching.
 * Returns lowercased tokens with stop words removed.
 */
export function extractMatchTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Compute a match confidence between an Amazon product and a CPSC recall.
 * Uses token overlap between product title and recall title/description/products.
 */
export function computeMatchConfidence(
  productTitle: string,
  productBrand: string | undefined,
  recall: CpscRecall,
): { confidence: number; matchedOn: string[] } {
  const productTokens = new Set(extractMatchTokens(productTitle));
  const brandTokens = productBrand
    ? new Set(extractMatchTokens(productBrand))
    : new Set<string>();

  let maxScore = 0;
  const matchedOn: string[] = [];

  // Match against recall title
  const titleTokens = extractMatchTokens(recall.Title);
  const titleOverlap = countOverlap(productTokens, titleTokens);
  const titleScore = titleTokens.length > 0 ? titleOverlap / titleTokens.length : 0;
  if (titleScore > maxScore) maxScore = titleScore;
  if (titleOverlap >= 2) matchedOn.push("title");

  // Match against recall product names
  for (const product of recall.Products) {
    const recallProductTokens = extractMatchTokens(product.Name);
    const overlap = countOverlap(productTokens, recallProductTokens);
    const score = recallProductTokens.length > 0 ? overlap / recallProductTokens.length : 0;
    if (score > maxScore) maxScore = score;
    if (overlap >= 2) matchedOn.push("product-name");

    // Brand match boost: if product brand matches recall product name
    if (brandTokens.size > 0) {
      const brandOverlap = countOverlap(brandTokens, recallProductTokens);
      if (brandOverlap > 0) {
        maxScore = Math.min(1, maxScore + 0.2);
        matchedOn.push("brand");
      }
    }
  }

  // Match against recall description (lower weight)
  const descTokens = extractMatchTokens(recall.Description);
  const descOverlap = countOverlap(productTokens, descTokens);
  const descScore = descTokens.length > 0 ? (descOverlap / descTokens.length) * 0.6 : 0;
  if (descScore > maxScore) maxScore = descScore;
  if (descOverlap >= 3) matchedOn.push("description");

  // Check if recall was sold on Amazon (strong relevance signal)
  const soldOnAmazon = recall.Retailers.some(
    (r) => r.Name.toLowerCase().includes("amazon"),
  );
  if (soldOnAmazon && maxScore > 0.1) {
    maxScore = Math.min(1, maxScore + 0.15);
    matchedOn.push("sold-on-amazon");
  }

  return { confidence: Math.round(maxScore * 100) / 100, matchedOn: [...new Set(matchedOn)] };
}

function countOverlap(setA: Set<string>, tokensB: string[]): number {
  let count = 0;
  for (const token of tokensB) {
    if (setA.has(token)) count++;
  }
  return count;
}

/**
 * Match a single product against a list of recalls.
 * Returns matches above the confidence threshold, sorted by confidence.
 */
export function matchProductToRecalls(
  productTitle: string,
  productBrand: string | undefined,
  recalls: CpscRecall[],
  minConfidence = MIN_CONFIDENCE,
): RecallMatch[] {
  const matches: RecallMatch[] = [];

  for (const recall of recalls) {
    const { confidence, matchedOn } = computeMatchConfidence(productTitle, productBrand, recall);
    if (confidence >= minConfidence) {
      matches.push({ recall, confidence, matchedOn });
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}

/**
 * Extract a search query from the current Amazon search page URL.
 * Falls back to extracting from the search input.
 */
export function extractSearchQuery(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get("k") ?? urlParams.get("field-keywords");
  if (query) return query.trim();

  // Fallback: read from search box
  const searchBox = document.querySelector<HTMLInputElement>("#twotabsearchtextbox");
  return searchBox?.value?.trim() || null;
}
