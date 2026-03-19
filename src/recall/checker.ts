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
const MIN_CONFIDENCE = 0.45;

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
 * Generic product type words that should have reduced matching weight.
 * These cause false positives when they're the only overlapping tokens.
 */
const GENERIC_PRODUCT_WORDS = new Set([
  "baby", "children", "kids", "adult", "portable", "electric", "wireless",
  "mini", "small", "large", "big", "inch", "pack", "black", "white", "blue",
  "red", "pink", "green", "gray", "grey",
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
 *
 * Key anti-false-positive measures:
 * - Generic product words get 0.5x weight
 * - Brand mismatch (recall names brand X, product is brand Y) applies a penalty
 * - "Sold on Amazon" boost only kicks in at ≥0.3 base confidence
 * - Minimum 2 non-generic token matches required for title/product-name
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
  let hasBrandMatch = false;

  // Extract the recall's brand from product names
  const recallBrandTokens = new Set<string>();
  for (const product of recall.Products) {
    const nameTokens = extractMatchTokens(product.Name);
    // First 1-2 tokens of recall product name are typically the brand
    for (const t of nameTokens.slice(0, 2)) {
      if (!GENERIC_PRODUCT_WORDS.has(t)) recallBrandTokens.add(t);
    }
  }

  // Match against recall product names (highest priority)
  for (const product of recall.Products) {
    const recallProductTokens = extractMatchTokens(product.Name);
    const { score, nonGenericMatches } = computeWeightedOverlap(productTokens, recallProductTokens);
    if (score > maxScore) maxScore = score;
    if (nonGenericMatches >= 2) matchedOn.push("product-name");

    // Brand match boost
    if (brandTokens.size > 0) {
      const brandOverlap = countOverlap(brandTokens, recallProductTokens);
      if (brandOverlap > 0) {
        maxScore = Math.min(1, maxScore + 0.25);
        matchedOn.push("brand");
        hasBrandMatch = true;
      }
    }
  }

  // Match against recall title
  const titleTokens = extractMatchTokens(recall.Title);
  const { score: titleScore, nonGenericMatches: titleNonGeneric } = computeWeightedOverlap(productTokens, titleTokens);
  if (titleScore > maxScore) maxScore = titleScore;
  if (titleNonGeneric >= 2) matchedOn.push("title");

  // Match against recall description (lower weight)
  const descTokens = extractMatchTokens(recall.Description);
  const { score: rawDescScore } = computeWeightedOverlap(productTokens, descTokens);
  const descScore = rawDescScore * 0.5; // descriptions are long, overlap is inflated
  if (descScore > maxScore) maxScore = descScore;
  if (rawDescScore > 0.2) matchedOn.push("description");

  // Brand mismatch penalty: if the recall names a specific brand and
  // the product has a DIFFERENT brand, reduce confidence significantly
  if (brandTokens.size > 0 && recallBrandTokens.size > 0 && !hasBrandMatch) {
    const brandMatchesRecall = [...brandTokens].some((t) => recallBrandTokens.has(t));
    if (!brandMatchesRecall) {
      maxScore *= 0.4; // 60% penalty for brand mismatch
    }
  }

  // "Sold on Amazon" boost — only meaningful when base match is already decent
  const soldOnAmazon = recall.Retailers.some(
    (r) => r.Name.toLowerCase().includes("amazon"),
  );
  if (soldOnAmazon && maxScore >= 0.3) {
    maxScore = Math.min(1, maxScore + 0.1);
    matchedOn.push("sold-on-amazon");
  }

  return { confidence: Math.round(maxScore * 100) / 100, matchedOn: [...new Set(matchedOn)] };
}

/**
 * Compute weighted token overlap, giving generic product words half weight.
 * Returns both the overall score and count of non-generic matches.
 */
function computeWeightedOverlap(
  productTokens: Set<string>,
  targetTokens: string[],
): { score: number; nonGenericMatches: number } {
  let weightedMatches = 0;
  let totalWeight = 0;
  let nonGenericMatches = 0;

  for (const token of targetTokens) {
    const isGeneric = GENERIC_PRODUCT_WORDS.has(token);
    const weight = isGeneric ? 0.5 : 1;
    totalWeight += weight;
    if (productTokens.has(token)) {
      weightedMatches += weight;
      if (!isGeneric) nonGenericMatches++;
    }
  }

  const score = totalWeight > 0 ? weightedMatches / totalWeight : 0;
  return { score, nonGenericMatches };
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
