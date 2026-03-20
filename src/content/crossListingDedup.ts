/**
 * Cross-listing duplicate detection — identifies the same product sold
 * under different ASINs / listings using title token similarity.
 *
 * Unlike variant dedup (dedup.ts) which groups exact-normalized titles,
 * this uses fuzzy Jaccard similarity to catch relisted products with
 * slightly different titles, brand prefixes, or keyword stuffing.
 */

import type { Product } from "../types";

/** A group of products identified as the same item across listings. */
export interface DuplicateGroup {
  /** Index of the "best" product (most reviews → highest rating → lowest price). */
  bestIndex: number;
  /** Indices of all products in this group (including bestIndex). */
  memberIndices: number[];
  /** Similarity score between group members (0-1). */
  similarity: number;
}

/** Result of cross-listing duplicate detection. */
export interface CrossListingResult {
  /** Groups of duplicate products. Only groups with 2+ members. */
  groups: DuplicateGroup[];
  /** Map from product index → group index (for quick lookup). */
  indexToGroup: Map<number, number>;
}

// ── Tokenization ──────────────────────────────────────────────────────

/** Words too common to be meaningful for similarity. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "in", "on", "to", "by",
  "of", "from", "is", "at", "it", "as", "no", "not", "up",
  "new", "best", "top", "high", "quality", "premium", "professional",
  "latest", "upgrade", "upgraded", "improved", "original", "genuine",
]);

/** Tokenize a product title into meaningful lowercase word tokens. */
export function tokenizeTitle(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

/** Jaccard similarity between two token sets. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size > b.size ? a : b;
  for (const token of smaller) {
    if (larger.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Detection ─────────────────────────────────────────────────────────

/** Default similarity threshold for cross-listing detection. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.55;

/**
 * Detect cross-listing duplicates among products.
 *
 * Strategy:
 * 1. Group products by brand (only compare within same brand).
 * 2. Within each brand group, compute pairwise Jaccard similarity on title tokens.
 * 3. Products with similarity ≥ threshold AND different ASINs are grouped.
 * 4. Best product in each group is kept as the primary listing.
 *
 * Performance: O(n²) within each brand group, but brand grouping keeps n small.
 */
export function detectCrossListingDuplicates(
  products: Product[],
  threshold = DEFAULT_SIMILARITY_THRESHOLD,
): CrossListingResult {
  const groups: DuplicateGroup[] = [];
  const indexToGroup = new Map<number, number>();

  // Skip if too few products
  if (products.length < 2) return { groups, indexToGroup };

  // Pre-tokenize all titles
  const tokenSets = products.map((p) => tokenizeTitle(p.title));

  // Group indices by brand (lowercase)
  const brandGroups = new Map<string, number[]>();
  for (let i = 0; i < products.length; i++) {
    const brand = products[i].brand.toLowerCase() || "__unknown__";
    let list = brandGroups.get(brand);
    if (!list) {
      list = [];
      brandGroups.set(brand, list);
    }
    list.push(i);
  }

  // Union-Find for grouping
  const parent = new Array(products.length);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const bestSim = new Map<string, number>(); // "i-j" → similarity

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(x: number, y: number): void {
    const px = find(x);
    const py = find(y);
    if (px !== py) parent[px] = py;
  }

  // Pairwise comparison within each brand group
  for (const indices of brandGroups.values()) {
    if (indices.length < 2) continue;

    for (let i = 0; i < indices.length; i++) {
      const ai = indices[i];
      if (tokenSets[ai].size < 3) continue; // Skip very short titles

      for (let j = i + 1; j < indices.length; j++) {
        const bi = indices[j];
        if (tokenSets[bi].size < 3) continue;

        // Skip if same ASIN (already handled by variant dedup)
        if (products[ai].asin && products[ai].asin === products[bi].asin) continue;

        const sim = jaccardSimilarity(tokenSets[ai], tokenSets[bi]);
        if (sim >= threshold) {
          union(ai, bi);
          const key = `${Math.min(ai, bi)}-${Math.max(ai, bi)}`;
          bestSim.set(key, sim);
        }
      }
    }
  }

  // Collect groups from union-find
  const rootToMembers = new Map<number, number[]>();
  for (let i = 0; i < products.length; i++) {
    const root = find(i);
    let members = rootToMembers.get(root);
    if (!members) {
      members = [];
      rootToMembers.set(root, members);
    }
    members.push(i);
  }

  // Build DuplicateGroup for groups with 2+ members
  for (const members of rootToMembers.values()) {
    if (members.length < 2) continue;

    // Find best product: most reviews → highest rating → lowest price
    let bestIdx = members[0];
    for (let i = 1; i < members.length; i++) {
      const idx = members[i];
      const curr = products[idx];
      const best = products[bestIdx];
      if (
        curr.reviewCount > best.reviewCount ||
        (curr.reviewCount === best.reviewCount && curr.rating > best.rating) ||
        (curr.reviewCount === best.reviewCount && curr.rating === best.rating &&
          curr.price !== null && best.price !== null && curr.price < best.price)
      ) {
        bestIdx = idx;
      }
    }

    // Average similarity across pairs
    let totalSim = 0;
    let pairCount = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = `${Math.min(members[i], members[j])}-${Math.max(members[i], members[j])}`;
        const sim = bestSim.get(key);
        if (sim) {
          totalSim += sim;
          pairCount++;
        }
      }
    }

    const groupIdx = groups.length;
    groups.push({
      bestIndex: bestIdx,
      memberIndices: members,
      similarity: pairCount > 0 ? totalSim / pairCount : threshold,
    });

    for (const idx of members) {
      indexToGroup.set(idx, groupIdx);
    }
  }

  return { groups, indexToGroup };
}

/**
 * Build a human-readable label for a duplicate indicator badge.
 */
export function duplicateLabel(
  group: DuplicateGroup,
  productIndex: number,
  products: Product[],
): string {
  const isBest = productIndex === group.bestIndex;
  const otherCount = group.memberIndices.length - 1;
  const simPct = Math.round(group.similarity * 100);

  if (isBest) {
    return `Best of ${otherCount + 1} similar listings (${simPct}% match)`;
  }
  const bestProduct = products[group.bestIndex];
  const bestTitle = bestProduct.title.length > 40
    ? bestProduct.title.slice(0, 39) + "…"
    : bestProduct.title;
  return `Similar to "${bestTitle}" (${simPct}% match)`;
}
