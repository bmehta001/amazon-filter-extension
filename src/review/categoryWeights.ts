/**
 * Category-specific scoring weights.
 *
 * Defines per-department weight profiles that adjust how review category
 * scores contribute to the overall review quality assessment. Auto-detects
 * the department from the search URL's `rh=n:NODEID` parameter or from
 * Amazon's breadcrumb/sidebar.
 */

import type { TopicScore } from "./types";

// ── Types ────────────────────────────────────────────────────────────

/** A weight profile for a specific Amazon department. */
export interface CategoryWeightProfile {
  /** Amazon department node ID (from `rh=n:NODEID`). */
  departmentId: string;
  /** Human-readable department label. */
  label: string;
  /** Multiplier per category ID (0.0 = irrelevant, 1.0 = normal, 2.0 = double). */
  weights: Record<string, number>;
}

/** Topic score with optional weighted rating added. */
export interface WeightedTopicScore extends TopicScore {
  /** Category weight multiplier applied. */
  weight: number;
  /** Weighted average rating (avgRating is raw, weightedAvgRating factors importance). */
  weightedAvgRating: number;
}

// ── Department Weight Profiles ───────────────────────────────────────

const DEFAULT_WEIGHT = 1.0;

const PROFILES: CategoryWeightProfile[] = [
  {
    departmentId: "172282",
    label: "Electronics",
    weights: {
      "performance": 2.0,
      "durability": 1.5,
      "compatibility": 1.5,
      "ease-of-use": 1.2,
      "product-quality": 1.3,
      "size-fit": 0.3,
      "appearance": 0.5,
    },
  },
  {
    departmentId: "7141123011",
    label: "Clothing, Shoes & Jewelry",
    weights: {
      "size-fit": 2.0,
      "appearance": 1.5,
      "durability": 1.5,
      "product-quality": 1.3,
      "performance": 0.3,
      "compatibility": 0.3,
    },
  },
  {
    departmentId: "1055398",
    label: "Home & Kitchen",
    weights: {
      "product-quality": 1.5,
      "ease-of-use": 1.5,
      "appearance": 1.2,
      "durability": 1.3,
      "size-fit": 1.0,
      "performance": 1.0,
    },
  },
  {
    departmentId: "165796011",
    label: "Baby",
    weights: {
      "product-quality": 2.0,
      "ease-of-use": 1.5,
      "durability": 1.5,
      "packaging": 1.2,
      "performance": 1.0,
      "appearance": 0.5,
    },
  },
  {
    departmentId: "3375251",
    label: "Sports & Outdoors",
    weights: {
      "durability": 2.0,
      "performance": 1.5,
      "size-fit": 1.2,
      "product-quality": 1.3,
      "ease-of-use": 1.0,
      "appearance": 0.5,
    },
  },
  {
    departmentId: "16310101",
    label: "Grocery & Gourmet Food",
    weights: {
      "product-quality": 2.0,
      "packaging": 1.5,
      "shipping-delivery": 1.5,
      "value": 1.3,
      "performance": 0.3,
      "compatibility": 0.2,
      "size-fit": 0.3,
    },
  },
  {
    departmentId: "228013",
    label: "Tools & Home Improvement",
    weights: {
      "durability": 2.0,
      "ease-of-use": 1.5,
      "performance": 1.5,
      "product-quality": 1.3,
      "compatibility": 1.2,
      "appearance": 0.3,
      "size-fit": 0.5,
    },
  },
  {
    departmentId: "3760911",
    label: "Beauty & Personal Care",
    weights: {
      "product-quality": 1.5,
      "appearance": 1.5,
      "performance": 1.2,
      "value": 1.2,
      "size-fit": 0.5,
      "compatibility": 0.3,
      "durability": 0.5,
    },
  },
  {
    departmentId: "283155",
    label: "Books",
    weights: {
      "product-quality": 1.5,
      "value": 1.2,
      "shipping-delivery": 1.0,
      "packaging": 1.0,
      "performance": 0.3,
      "durability": 0.5,
      "size-fit": 0.3,
      "compatibility": 0.2,
      "appearance": 0.3,
    },
  },
  {
    departmentId: "2619525011",
    label: "Toys & Games",
    weights: {
      "product-quality": 1.5,
      "durability": 1.5,
      "ease-of-use": 1.3,
      "appearance": 1.2,
      "performance": 1.0,
      "value": 1.2,
      "size-fit": 0.8,
    },
  },
];

/** Map department ID → profile for O(1) lookup. */
const PROFILE_MAP = new Map<string, CategoryWeightProfile>(
  PROFILES.map((p) => [p.departmentId, p]),
);

/** Profile label lookup by text match (for breadcrumb detection). */
const LABEL_MAP = new Map<string, CategoryWeightProfile>(
  PROFILES.map((p) => [p.label.toLowerCase(), p]),
);

// ── Public API ───────────────────────────────────────────────────────

/** Default weight profile: all categories at 1.0. */
export const DEFAULT_PROFILE: CategoryWeightProfile = {
  departmentId: "default",
  label: "All Categories",
  weights: {},
};

/**
 * Get the weight profile for a department ID.
 * Falls back to the default profile (all 1.0) if unknown.
 */
export function getWeightProfile(departmentId: string | null): CategoryWeightProfile {
  if (!departmentId) return DEFAULT_PROFILE;
  return PROFILE_MAP.get(departmentId) ?? DEFAULT_PROFILE;
}

/**
 * Get the weight for a specific category within a profile.
 * Returns DEFAULT_WEIGHT (1.0) if the category isn't listed.
 */
export function getCategoryWeight(profile: CategoryWeightProfile, categoryId: string): number {
  return profile.weights[categoryId] ?? DEFAULT_WEIGHT;
}

/**
 * Detect the current Amazon department from the page URL and DOM.
 * Tries URL `rh` parameter first (most reliable), then breadcrumb text.
 */
export function detectDepartment(): { departmentId: string | null; label: string | null } {
  // Strategy 1: Parse `rh` parameter from URL for `n:NODEID`
  const params = new URLSearchParams(window.location.search);
  const rh = params.get("rh") || "";
  const nodeMatch = rh.match(/n[:/](\d+)/);
  if (nodeMatch) {
    const nodeId = nodeMatch[1];
    const profile = PROFILE_MAP.get(nodeId);
    if (profile) {
      return { departmentId: nodeId, label: profile.label };
    }
    // Known node ID but no profile — still return the ID
    return { departmentId: nodeId, label: null };
  }

  // Strategy 2: Parse `i` parameter (category index name)
  const iParam = params.get("i") || "";
  const categoryAliases: Record<string, string> = {
    "electronics": "172282",
    "fashion": "7141123011",
    "garden": "1055398",
    "baby-products": "165796011",
    "sporting": "3375251",
    "grocery": "16310101",
    "tools": "228013",
    "beauty": "3760911",
    "stripbooks": "283155",
    "toys-and-games": "2619525011",
  };
  if (iParam && categoryAliases[iParam]) {
    const id = categoryAliases[iParam];
    const profile = PROFILE_MAP.get(id)!;
    return { departmentId: id, label: profile.label };
  }

  // Strategy 3: Breadcrumb text in sidebar
  try {
    const breadcrumb = document.querySelector(
      "#s-refinements .a-breadcrumb, #departments .a-breadcrumb",
    );
    if (breadcrumb) {
      const text = breadcrumb.textContent?.trim().toLowerCase() || "";
      for (const [label, profile] of LABEL_MAP) {
        if (text.includes(label)) {
          return { departmentId: profile.departmentId, label: profile.label };
        }
      }
    }
  } catch {
    // DOM access may fail in non-browser environments
  }

  return { departmentId: null, label: null };
}

/**
 * Apply category weights to topic scores.
 * Returns new WeightedTopicScore array with weight multiplier applied.
 */
export function applyWeights(
  topicScores: TopicScore[],
  profile: CategoryWeightProfile,
): WeightedTopicScore[] {
  return topicScores.map((ts) => {
    const weight = getCategoryWeight(profile, ts.categoryId);
    return {
      ...ts,
      weight,
      weightedAvgRating: Math.round(ts.avgRating * weight * 10) / 10,
    };
  });
}

/**
 * Compute a single weighted aggregate score from topic scores + weight profile.
 * Uses a weighted average where each topic's contribution is scaled by its
 * weight multiplier AND its mention count (more-mentioned topics matter more).
 */
export function computeWeightedAggregate(
  topicScores: TopicScore[],
  profile: CategoryWeightProfile,
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const ts of topicScores) {
    const categoryWeight = getCategoryWeight(profile, ts.categoryId);
    const mentionWeight = ts.reviewMentions;
    const combined = categoryWeight * mentionWeight;
    weightedSum += ts.avgRating * combined;
    totalWeight += combined;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

/** Exported for testing. */
export { PROFILES };
