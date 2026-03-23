/**
 * Tests for category-specific scoring weights.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  getWeightProfile,
  getCategoryWeight,
  detectDepartment,
  applyWeights,
  computeWeightedAggregate,
  DEFAULT_PROFILE,
  PROFILES,
} from "../src/review/categoryWeights";
import type { TopicScore } from "../src/review/types";

// ── Helpers ──────────────────────────────────────────────────────────

function makeTopicScore(overrides: Partial<TopicScore> = {}): TopicScore {
  return {
    categoryId: "product-quality",
    avgRating: 4.0,
    sentenceMentions: 10,
    reviewMentions: 5,
    sentiment: "positive",
    ...overrides,
  };
}

// ── getWeightProfile ─────────────────────────────────────────────────

describe("getWeightProfile", () => {
  it("returns Electronics profile for known department ID", () => {
    const profile = getWeightProfile("172282");
    expect(profile.label).toBe("Electronics");
    expect(profile.weights["performance"]).toBe(2.0);
  });

  it("returns Clothing profile for known department ID", () => {
    const profile = getWeightProfile("7141123011");
    expect(profile.label).toBe("Clothing, Shoes & Jewelry");
    expect(profile.weights["size-fit"]).toBe(2.0);
  });

  it("returns default profile for unknown department ID", () => {
    const profile = getWeightProfile("999999999");
    expect(profile).toBe(DEFAULT_PROFILE);
    expect(profile.departmentId).toBe("default");
    expect(Object.keys(profile.weights)).toHaveLength(0);
  });

  it("returns default profile for null department ID", () => {
    const profile = getWeightProfile(null);
    expect(profile).toBe(DEFAULT_PROFILE);
  });

  it("all defined profiles have a departmentId and label", () => {
    for (const p of PROFILES) {
      expect(p.departmentId).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(typeof p.weights).toBe("object");
    }
  });

  it("returns distinct profiles for each known department", () => {
    const ids = PROFILES.map((p) => p.departmentId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });
});

// ── getCategoryWeight ────────────────────────────────────────────────

describe("getCategoryWeight", () => {
  it("returns defined weight for category in profile", () => {
    const electronics = getWeightProfile("172282");
    expect(getCategoryWeight(electronics, "performance")).toBe(2.0);
    expect(getCategoryWeight(electronics, "size-fit")).toBe(0.3);
  });

  it("returns 1.0 for category not in profile weights", () => {
    const electronics = getWeightProfile("172282");
    // "customer-service" is not defined in Electronics weights
    expect(getCategoryWeight(electronics, "customer-service")).toBe(1.0);
  });

  it("returns 1.0 for any category in default profile", () => {
    expect(getCategoryWeight(DEFAULT_PROFILE, "performance")).toBe(1.0);
    expect(getCategoryWeight(DEFAULT_PROFILE, "anything")).toBe(1.0);
  });
});

// ── detectDepartment ─────────────────────────────────────────────────

describe("detectDepartment", () => {
  beforeEach(() => {
    // Reset window.location for each test
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "https://www.amazon.com/s?k=headphones",
    });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
  });

  it("detects department from rh parameter with n: format", () => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "https://www.amazon.com/s?k=headphones&rh=n:172282,p_89:Sony",
    });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);

    const result = detectDepartment();
    expect(result.departmentId).toBe("172282");
    expect(result.label).toBe("Electronics");
  });

  it("detects department from rh parameter with n/ format", () => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "https://www.amazon.com/s?k=shoes&rh=n/7141123011",
    });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);

    const result = detectDepartment();
    expect(result.departmentId).toBe("7141123011");
    expect(result.label).toBe("Clothing, Shoes & Jewelry");
  });

  it("returns unknown node ID when rh has node not in profiles", () => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "https://www.amazon.com/s?k=stuff&rh=n:9999999",
    });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);

    const result = detectDepartment();
    expect(result.departmentId).toBe("9999999");
    expect(result.label).toBeNull();
  });

  it("returns null when no department indicators exist", () => {
    const result = detectDepartment();
    expect(result.departmentId).toBeNull();
    expect(result.label).toBeNull();
  });

  it("detects from i parameter (category alias)", () => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "https://www.amazon.com/s?k=tools&i=tools",
    });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);

    const result = detectDepartment();
    expect(result.departmentId).toBe("228013");
    expect(result.label).toBe("Tools & Home Improvement");
  });

  it("detects from breadcrumb text", () => {
    const dom = new JSDOM(
      '<div id="s-refinements"><div class="a-breadcrumb">Electronics</div></div>',
      { url: "https://www.amazon.com/s?k=hdmi" },
    );
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);

    const result = detectDepartment();
    expect(result.departmentId).toBe("172282");
    expect(result.label).toBe("Electronics");
  });
});

// ── applyWeights ─────────────────────────────────────────────────────

describe("applyWeights", () => {
  it("applies weight multiplier to topic scores", () => {
    const electronics = getWeightProfile("172282");
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "performance", avgRating: 4.0 }),
      makeTopicScore({ categoryId: "size-fit", avgRating: 3.5 }),
    ];

    const weighted = applyWeights(topics, electronics);
    expect(weighted).toHaveLength(2);

    // Performance: weight 2.0, so weightedAvgRating = 4.0 * 2.0 = 8.0
    expect(weighted[0].weight).toBe(2.0);
    expect(weighted[0].weightedAvgRating).toBe(8.0);

    // Size-fit: weight 0.3, so weightedAvgRating = 3.5 * 0.3 = 1.05 → 1.1
    expect(weighted[1].weight).toBe(0.3);
    expect(weighted[1].weightedAvgRating).toBe(1.1);
  });

  it("uses weight 1.0 for undefined categories", () => {
    const electronics = getWeightProfile("172282");
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "customer-service", avgRating: 3.0 }),
    ];

    const weighted = applyWeights(topics, electronics);
    expect(weighted[0].weight).toBe(1.0);
    expect(weighted[0].weightedAvgRating).toBe(3.0);
  });

  it("preserves original topic score fields", () => {
    const topics: TopicScore[] = [
      makeTopicScore({
        categoryId: "durability",
        avgRating: 4.5,
        reviewMentions: 8,
        sentiment: "positive",
        trend: "rising",
      }),
    ];

    const weighted = applyWeights(topics, DEFAULT_PROFILE);
    expect(weighted[0].categoryId).toBe("durability");
    expect(weighted[0].avgRating).toBe(4.5);
    expect(weighted[0].reviewMentions).toBe(8);
    expect(weighted[0].sentiment).toBe("positive");
    expect(weighted[0].trend).toBe("rising");
  });
});

// ── computeWeightedAggregate ─────────────────────────────────────────

describe("computeWeightedAggregate", () => {
  it("returns 0 for empty topic scores", () => {
    expect(computeWeightedAggregate([], DEFAULT_PROFILE)).toBe(0);
  });

  it("returns simple average for default profile (all weights 1.0)", () => {
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "performance", avgRating: 4.0, reviewMentions: 5 }),
      makeTopicScore({ categoryId: "durability", avgRating: 3.0, reviewMentions: 5 }),
    ];
    const result = computeWeightedAggregate(topics, DEFAULT_PROFILE);
    expect(result).toBe(3.5); // (4*5 + 3*5) / (5+5) = 3.5
  });

  it("weights high-importance categories more heavily", () => {
    const electronics = getWeightProfile("172282");
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "performance", avgRating: 4.5, reviewMentions: 5 }),
      makeTopicScore({ categoryId: "size-fit", avgRating: 2.0, reviewMentions: 5 }),
    ];

    const weighted = computeWeightedAggregate(topics, electronics);
    const unweighted = computeWeightedAggregate(topics, DEFAULT_PROFILE);

    // Weighted should be higher because performance (4.5★) has weight 2.0
    // while size-fit (2.0★) has weight 0.3
    expect(weighted).toBeGreaterThan(unweighted);
    expect(weighted).toBeGreaterThan(4.0); // heavily skewed toward performance
  });

  it("factors in reviewMentions alongside category weight", () => {
    const electronics = getWeightProfile("172282");
    // Performance rated 3.0 with 10 mentions, size-fit rated 5.0 with 1 mention
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "performance", avgRating: 3.0, reviewMentions: 10 }),
      makeTopicScore({ categoryId: "size-fit", avgRating: 5.0, reviewMentions: 1 }),
    ];

    const result = computeWeightedAggregate(topics, electronics);
    // Performance dominates: 3.0 * 2.0 * 10 = 60, size-fit: 5.0 * 0.3 * 1 = 1.5
    // Aggregate ≈ 61.5 / 20.3 ≈ 3.03
    expect(result).toBeCloseTo(3.0, 0);
  });

  it("returns single topic's rating when only one topic", () => {
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "durability", avgRating: 4.2, reviewMentions: 3 }),
    ];
    expect(computeWeightedAggregate(topics, DEFAULT_PROFILE)).toBe(4.2);
  });
});

// ── Integration: all weight profiles load correctly ───────────────────

describe("weight profile sanity checks", () => {
  const EXPECTED: Record<string, { label: string; topCategory: string; topWeight: number }> = {
    "172282":      { label: "Electronics",                topCategory: "performance",    topWeight: 2.0 },
    "7141123011":  { label: "Clothing, Shoes & Jewelry",  topCategory: "size-fit",       topWeight: 2.0 },
    "1055398":     { label: "Home & Kitchen",             topCategory: "product-quality", topWeight: 1.5 },
    "165796011":   { label: "Baby",                       topCategory: "product-quality", topWeight: 2.0 },
    "3375251":     { label: "Sports & Outdoors",          topCategory: "durability",     topWeight: 2.0 },
    "16310101":    { label: "Grocery & Gourmet Food",     topCategory: "product-quality", topWeight: 2.0 },
    "228013":      { label: "Tools & Home Improvement",   topCategory: "durability",     topWeight: 2.0 },
    "3760911":     { label: "Beauty & Personal Care",     topCategory: "product-quality", topWeight: 1.5 },
    "283155":      { label: "Books",                      topCategory: "product-quality", topWeight: 1.5 },
    "2619525011":  { label: "Toys & Games",               topCategory: "product-quality", topWeight: 1.5 },
  };

  it("all 10 department profiles load with correct labels and top-weighted categories", () => {
    for (const [id, expected] of Object.entries(EXPECTED)) {
      const p = getWeightProfile(id);
      expect(p.label).toBe(expected.label);
      expect(p.weights[expected.topCategory]).toBe(expected.topWeight);
      expect(Object.keys(p.weights).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("no duplicate department IDs across profiles", () => {
    const ids = PROFILES.map((p) => p.departmentId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
