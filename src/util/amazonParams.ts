/**
 * Amazon search URL parameter definitions and builder.
 *
 * Amazon's search uses several undocumented URL parameters for
 * server-side filtering that most users don't know about.
 */

// ── Parameter definitions ─────────────────────────────────────────────

/** Amazon's own seller/merchant ID. */
export const AMAZON_SELLER_ID = "ATVPDKIKX0DER";

/** Condition filter node IDs (US marketplace). */
export const CONDITIONS: { label: string; value: string }[] = [
  { label: "New", value: "New" },
  { label: "Used", value: "Used" },
  { label: "Renewed / Refurbished", value: "Renewed" },
  { label: "Collectible", value: "Collectible" },
];

/** Star rating filter node IDs (US marketplace). */
export const STAR_RATINGS: { label: string; value: string }[] = [
  { label: "4★ & Up", value: "4" },
  { label: "3★ & Up", value: "3" },
  { label: "2★ & Up", value: "2" },
  { label: "1★ & Up", value: "1" },
];

/** Common Amazon departments with their node IDs (US marketplace). */
export const DEPARTMENTS: { label: string; nodeId: string }[] = [
  { label: "All Departments", nodeId: "" },
  { label: "Electronics", nodeId: "172282" },
  { label: "Computers & Accessories", nodeId: "541966" },
  { label: "Cell Phones & Accessories", nodeId: "2335752011" },
  { label: "Home & Kitchen", nodeId: "1055398" },
  { label: "Tools & Home Improvement", nodeId: "228013" },
  { label: "Sports & Outdoors", nodeId: "3375251" },
  { label: "Clothing, Shoes & Jewelry", nodeId: "7141123011" },
  { label: "Health & Household", nodeId: "3760901" },
  { label: "Baby", nodeId: "165796011" },
  { label: "Toys & Games", nodeId: "165793011" },
  { label: "Grocery & Gourmet Food", nodeId: "16310101" },
  { label: "Pet Supplies", nodeId: "2619533011" },
  { label: "Beauty & Personal Care", nodeId: "3760911" },
  { label: "Automotive", nodeId: "15684181" },
  { label: "Office Products", nodeId: "1064954" },
  { label: "Books", nodeId: "283155" },
  { label: "Garden & Outdoor", nodeId: "2972638011" },
  { label: "Musical Instruments", nodeId: "11091801" },
  { label: "Industrial & Scientific", nodeId: "16310091" },
  { label: "Arts, Crafts & Sewing", nodeId: "2617941011" },
  { label: "Appliances", nodeId: "2619525011" },
];

/** Sort options with their Amazon URL values. */
export const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: "Featured", value: "" },
  { label: "Price: Low to High", value: "price-asc-rank" },
  { label: "Price: High to Low", value: "price-desc-rank" },
  { label: "Avg. Customer Review", value: "review-rank" },
  { label: "Newest Arrivals", value: "date-desc-rank" },
  { label: "Most Reviews", value: "review-count-rank" },
];

// ── Advanced query options ────────────────────────────────────────────

/** All configurable options for the advanced search builder. */
export interface AdvancedSearchOptions {
  /** Words to exclude from search (added as -word in query). */
  excludeWords: string[];
  /** Amazon department node ID (empty = all). */
  department: string;
  /** Minimum star rating ("4", "3", "2", "1", or "" for any). */
  minStars: string;
  /** Product condition filter (empty = any). */
  condition: string;
  /** Restrict to Prime-eligible items. */
  primeOnly: boolean;
  /** Server-side price min (in dollars, null = no min). */
  priceMin: number | null;
  /** Server-side price max (in dollars, null = no max). */
  priceMax: number | null;
  /** Sort order (empty = featured). */
  sort: string;
  /** Restrict to Amazon-sold items. */
  amazonOnly: boolean;
}

export const DEFAULT_ADVANCED_OPTIONS: AdvancedSearchOptions = {
  excludeWords: [],
  department: "",
  minStars: "",
  condition: "",
  primeOnly: false,
  priceMin: null,
  priceMax: null,
  sort: "",
  amazonOnly: false,
};

// ── URL Builder ───────────────────────────────────────────────────────

/**
 * Build an Amazon search URL with advanced parameters applied.
 * @param baseQuery The base search query (what the user typed).
 * @param options Advanced search options to apply.
 * @param baseUrl Current page URL (for preserving domain).
 */
export function buildAdvancedSearchUrl(
  baseQuery: string,
  options: AdvancedSearchOptions,
  baseUrl: string = location.href,
): string {
  try {
    const url = new URL(baseUrl);
    // Reset to clean search path
    url.pathname = "/s";

    // Build query with exclusions
    let query = baseQuery.trim();
    for (const word of options.excludeWords) {
      const exclusion = word.includes(" ") ? `-"${word}"` : `-${word}`;
      if (!query.includes(exclusion)) {
        query += ` ${exclusion}`;
      }
    }
    url.searchParams.set("k", query.trim());

    // Department (node ID)
    if (options.department) {
      // Use rh parameter for department filtering
      const rhParts: string[] = [`n:${options.department}`];

      // Star rating within department
      if (options.minStars) {
        rhParts.push(`p_72:${getStarNodeId(options.minStars)}`);
      }

      // Condition within department
      if (options.condition) {
        rhParts.push(`p_n_condition-type:${options.condition}`);
      }

      url.searchParams.set("rh", rhParts.join(","));
    } else {
      // Without department, use individual params
      if (options.minStars) {
        url.searchParams.set("rh", `p_72:${getStarNodeId(options.minStars)}`);
      }
    }

    // Prime-only
    if (options.primeOnly) {
      url.searchParams.set("p_85", "2470955011");
    } else {
      url.searchParams.delete("p_85");
    }

    // Server-side price range (Amazon uses cents in p_36)
    if (options.priceMin !== null || options.priceMax !== null) {
      const minCents = options.priceMin !== null ? Math.round(options.priceMin * 100) : "";
      const maxCents = options.priceMax !== null ? Math.round(options.priceMax * 100) : "";
      url.searchParams.set("p_36", `${minCents}-${maxCents}`);
    } else {
      url.searchParams.delete("p_36");
    }

    // Sort
    if (options.sort) {
      url.searchParams.set("s", options.sort);
    } else {
      url.searchParams.delete("s");
    }

    // Amazon-only seller
    if (options.amazonOnly) {
      url.searchParams.set("emi", AMAZON_SELLER_ID);
    } else {
      url.searchParams.delete("emi");
    }

    // Clean up stale pagination
    url.searchParams.delete("page");
    url.searchParams.delete("qid");
    url.searchParams.delete("ref");

    return url.toString();
  } catch {
    return baseUrl;
  }
}

/** Map star rating selection to Amazon's review node ID. */
function getStarNodeId(stars: string): string {
  // These are the US marketplace node IDs for review rating filters
  switch (stars) {
    case "4": return "2661618011";
    case "3": return "2661617011";
    case "2": return "2661616011";
    case "1": return "2661615011";
    default: return "";
  }
}

/**
 * Parse current URL to extract any existing advanced search options.
 */
export function parseAdvancedOptions(url: string = location.href): Partial<AdvancedSearchOptions> {
  try {
    const parsed = new URL(url);
    const options: Partial<AdvancedSearchOptions> = {};

    // Extract exclusions from query
    const query = parsed.searchParams.get("k") ?? "";
    const excludeMatches = query.matchAll(/-"([^"]+)"|-(\S+)/g);
    const excludeWords: string[] = [];
    for (const match of excludeMatches) {
      const word = match[1] ?? match[2];
      if (word) excludeWords.push(word);
    }
    if (excludeWords.length > 0) options.excludeWords = excludeWords;

    // Prime
    if (parsed.searchParams.has("p_85")) options.primeOnly = true;

    // Amazon-only
    if (parsed.searchParams.get("emi") === AMAZON_SELLER_ID) options.amazonOnly = true;

    // Sort
    const sort = parsed.searchParams.get("s");
    if (sort) options.sort = sort;

    // Price range
    const priceRange = parsed.searchParams.get("p_36");
    if (priceRange) {
      const [minStr, maxStr] = priceRange.split("-");
      if (minStr) options.priceMin = parseInt(minStr, 10) / 100;
      if (maxStr) options.priceMax = parseInt(maxStr, 10) / 100;
    }

    return options;
  } catch {
    return {};
  }
}
