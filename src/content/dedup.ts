import type { Product } from "../types";

export interface DedupCategory {
  id: string;
  label: string;
  icon: string;
  /** Words/patterns to strip from titles when normalizing for this category. */
  patterns: RegExp;
}

export const DEDUP_CATEGORIES: DedupCategory[] = [
  {
    id: "color",
    label: "Color",
    icon: "🎨",
    patterns:
      /\b(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey|silver|gold|navy|teal|cyan|magenta|maroon|beige|ivory|coral|turquoise|indigo|olive|charcoal|rose|midnight|space grey|space gray|graphite|starlight|matte black|jet black|arctic white|pearl white|dark blue|light blue|sky blue|royal blue|forest green|mint green|dark green|light green|hot pink|baby pink|deep purple|bright red|wine red|champagne|platinum|bronze|copper|multi-?color(?:ed)?|multicolor)\b/gi,
  },
  {
    id: "size",
    label: "Size / Length",
    icon: "📏",
    patterns:
      /\b(\d+(?:\.\d+)?\s*(?:inch(?:es)?|in|ft|feet|foot|cm|mm|meter|m)\b|\b(?:small|medium|large|x-?large|xx-?large|xs|sm|md|lg|xl|xxl|2xl|3xl)\b|\b\d+(?:\.\d+)?\s*(?:oz|ounce|ml|liter|gallon|qt|quart|pint|cup|fl\.?\s*oz)\b)/gi,
  },
  {
    id: "count",
    label: "Count / Quantity",
    icon: "🔢",
    patterns:
      /\b(\d+[\s-]*(?:pack|count|piece|pcs|pc|set|pair|ct)\b|\b(?:single|double|triple)\b)/gi,
  },
  {
    id: "style",
    label: "Style / Pattern",
    icon: "✨",
    patterns:
      /\b(modern|classic|vintage|retro|contemporary|traditional|slim|regular|standard|pro|plus|lite|mini|max|ultra|premium|basic|deluxe|edition|version|gen(?:eration)?\s*\d|v\d|type[\s-]?[a-c]|model\s*[a-z0-9])\b/gi,
  },
];

/** Noise words/punctuation stripped during normalization. */
const NOISE_RE = /\b(with|and|for|the|a|an|of|in|on|to|by)\b/gi;
const PUNCTUATION_RE = /[^\w\s]/g;
const MULTI_SPACE_RE = /\s{2,}/g;

/**
 * Normalize a product title by removing variant-specific words for the given categories.
 * Returns a lowercase, trimmed, whitespace-collapsed key.
 */
export function normalizeTitle(
  title: string,
  categoriesToStrip: string[],
): string {
  let normalized = title.toLowerCase();

  // Strip variant words for each selected category
  for (const catId of categoriesToStrip) {
    const cat = DEDUP_CATEGORIES.find((c) => c.id === catId);
    if (cat) {
      normalized = normalized.replace(cat.patterns, "");
    }
  }

  // Remove punctuation
  normalized = normalized.replace(PUNCTUATION_RE, " ");

  // Remove common noise words
  normalized = normalized.replace(NOISE_RE, "");

  // Collapse whitespace and trim
  normalized = normalized.replace(MULTI_SPACE_RE, " ").trim();

  return normalized;
}

/**
 * Given a list of products and the dedup categories to apply,
 * return a Set of product indices that should be hidden (duplicates).
 * The "best" variant (most reviews, then highest rating) is kept visible.
 */
export function findDuplicates(
  products: Product[],
  dedupCategories: string[],
): Set<number> {
  if (dedupCategories.length === 0) return new Set();

  // Group products by normalized title key
  const groups = new Map<string, number[]>();

  for (let i = 0; i < products.length; i++) {
    const key = normalizeTitle(products[i].title, dedupCategories);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(i);
  }

  const duplicates = new Set<number>();

  for (const indices of groups.values()) {
    if (indices.length <= 1) continue;

    // Find the best product: most reviews, tiebreak by highest rating
    let bestIdx = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const idx = indices[i];
      const current = products[idx];
      const best = products[bestIdx];

      if (
        current.reviewCount > best.reviewCount ||
        (current.reviewCount === best.reviewCount &&
          current.rating > best.rating)
      ) {
        bestIdx = idx;
      }
    }

    // Mark all others as duplicates
    for (const idx of indices) {
      if (idx !== bestIdx) {
        duplicates.add(idx);
      }
    }
  }

  return duplicates;
}
