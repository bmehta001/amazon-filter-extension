import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("chrome", {
  storage: {
    sync: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    local: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined },
});

import { generateSummaryFromTopicScores } from "../src/review/summary";
import { applyWeights, computeWeightedAggregate, getWeightProfile } from "../src/review/categoryWeights";
import type { TopicScore } from "../src/review/types";

function makeTopicScores(): TopicScore[] {
  return [
    { categoryId: "performance", avgRating: 4.5, sentenceMentions: 10, reviewMentions: 5, sentiment: "positive" },
    { categoryId: "durability", avgRating: 4.0, sentenceMentions: 8, reviewMentions: 4, sentiment: "positive" },
    { categoryId: "size-fit", avgRating: 3.8, sentenceMentions: 6, reviewMentions: 3, sentiment: "positive" },
    { categoryId: "appearance", avgRating: 2.5, sentenceMentions: 4, reviewMentions: 3, sentiment: "negative" },
    { categoryId: "ease-of-use", avgRating: 3.0, sentenceMentions: 5, reviewMentions: 2, sentiment: "negative" },
  ];
}

// ── Weighted summary sorting ──

describe("weighted summary generation", () => {
  it("without weights, sorts pros by raw mention count", () => {
    const scores = makeTopicScores();
    const summary = generateSummaryFromTopicScores(scores);
    expect(summary).not.toBeNull();
    // performance (5 mentions) > durability (4) > size-fit (3)
    expect(summary!.pros[0].label).toContain("erformance");
  });

  it("with Electronics weights, performance (2.0x) ranks highest", () => {
    const scores = makeTopicScores();
    const profile = getWeightProfile("172282"); // Electronics
    const weighted = applyWeights(scores, profile);
    const summary = generateSummaryFromTopicScores(weighted, "Electronics", 4.2);

    expect(summary).not.toBeNull();
    // performance has weight=2.0, 5 mentions → score=10
    // durability has weight=1.5, 4 mentions → score=6
    expect(summary!.pros[0].label).toContain("erformance");
    expect(summary!.departmentLabel).toBe("Electronics");
    expect(summary!.weightedScore).toBe(4.2);
  });

  it("with Clothing weights, size-fit (2.0x) outranks performance (0.3x)", () => {
    const scores = makeTopicScores();
    const profile = getWeightProfile("7141123011"); // Clothing
    const weighted = applyWeights(scores, profile);
    const summary = generateSummaryFromTopicScores(weighted, "Clothing, Shoes & Jewelry");

    expect(summary).not.toBeNull();
    // size-fit: weight=2.0, 3 mentions → score=6
    // performance: weight=0.3, 5 mentions → score=1.5
    // durability: weight=1.5, 4 mentions → score=6 (tie, higher avgRating wins)
    const proLabels = summary!.pros.map((p) => p.label.toLowerCase());
    // size-fit should be in top 3 with clothing weights
    expect(proLabels.some((l) => l.includes("size") || l.includes("fit"))).toBe(true);
  });

  it("includes department label in oneLiner when weighted", () => {
    const scores = makeTopicScores();
    const profile = getWeightProfile("172282");
    const weighted = applyWeights(scores, profile);
    const agg = computeWeightedAggregate(scores, profile);
    const summary = generateSummaryFromTopicScores(weighted, "Electronics", agg);

    expect(summary!.oneLiner).toContain("Electronics");
    expect(summary!.oneLiner).toContain("🏷️");
  });

  it("does not include department label when no weights applied", () => {
    const scores = makeTopicScores();
    const summary = generateSummaryFromTopicScores(scores);
    expect(summary!.oneLiner).not.toContain("🏷️");
    expect(summary!.departmentLabel).toBeUndefined();
    expect(summary!.weightedScore).toBeUndefined();
  });

  it("weighted sentiment changes when weight amplifies low rating", () => {
    // ease-of-use has avgRating=3.0, normally "negative"
    // With Electronics weight=1.2, weightedAvgRating = 3.0 * 1.2 = 3.6 → positive
    const scores: TopicScore[] = [
      { categoryId: "ease-of-use", avgRating: 3.0, sentenceMentions: 5, reviewMentions: 3, sentiment: "negative" },
    ];
    const profile = getWeightProfile("172282"); // ease-of-use weight = 1.2
    const weighted = applyWeights(scores, profile);
    const summary = generateSummaryFromTopicScores(weighted, "Electronics");

    expect(summary).not.toBeNull();
    // weightedAvgRating = 3.0 * 1.2 = 3.6 → ≥ 3.5 → positive
    expect(summary!.pros.length).toBe(1);
    expect(summary!.cons.length).toBe(0);
  });

  it("weight < 1.0 can flip positive to negative", () => {
    // appearance has avgRating=3.6 (barely positive)
    // With Electronics weight=0.5, weightedAvgRating = 3.6 * 0.5 = 1.8 → negative
    const scores: TopicScore[] = [
      { categoryId: "appearance", avgRating: 3.6, sentenceMentions: 4, reviewMentions: 3, sentiment: "positive" },
    ];
    const profile = getWeightProfile("172282"); // appearance weight = 0.5
    const weighted = applyWeights(scores, profile);
    const summary = generateSummaryFromTopicScores(weighted, "Electronics");

    expect(summary).not.toBeNull();
    // weightedAvgRating = 3.6 * 0.5 = 1.8 → < 3.5 → negative
    expect(summary!.cons.length).toBe(1);
    expect(summary!.pros.length).toBe(0);
  });
});

// ── Weighted aggregate ──

describe("weighted aggregate in summary context", () => {
  it("returns different aggregate for different departments", () => {
    const scores = makeTopicScores();
    const electronicsProfile = getWeightProfile("172282");
    const clothingProfile = getWeightProfile("7141123011");

    const electronicsAgg = computeWeightedAggregate(scores, electronicsProfile);
    const clothingAgg = computeWeightedAggregate(scores, clothingProfile);

    expect(electronicsAgg).not.toBe(clothingAgg);
    // Both should be between 1 and 5
    expect(electronicsAgg).toBeGreaterThan(0);
    expect(electronicsAgg).toBeLessThanOrEqual(5);
    expect(clothingAgg).toBeGreaterThan(0);
    expect(clothingAgg).toBeLessThanOrEqual(5);
  });

  it("default profile gives unweighted average", () => {
    const scores = makeTopicScores();
    const defaultProfile = getWeightProfile(null);
    const agg = computeWeightedAggregate(scores, defaultProfile);

    // With default weights (all 1.0), should be mentions-weighted avg
    expect(agg).toBeCloseTo(3.7, 1);
  });

  it("summary includes weighted score", () => {
    const scores = makeTopicScores();
    const profile = getWeightProfile("16310101"); // Grocery
    const weighted = applyWeights(scores, profile);
    const agg = computeWeightedAggregate(scores, profile);
    const summary = generateSummaryFromTopicScores(weighted, "Grocery & Gourmet Food", agg);

    expect(summary!.weightedScore).toBe(agg);
    expect(summary!.oneLiner).toContain(agg.toFixed(1));
  });
});

// ── ReviewAspect weight field ──

describe("ReviewAspect carries weight", () => {
  it("aspect includes weight when generated from weighted scores", () => {
    const scores = makeTopicScores();
    const profile = getWeightProfile("172282");
    const weighted = applyWeights(scores, profile);
    const summary = generateSummaryFromTopicScores(weighted, "Electronics");

    for (const pro of summary!.pros) {
      expect(pro.weight).toBeDefined();
      expect(pro.weight).toBeGreaterThan(0);
    }
  });

  it("aspect has no weight when generated from unweighted scores", () => {
    const scores = makeTopicScores();
    const summary = generateSummaryFromTopicScores(scores);

    for (const pro of summary!.pros) {
      expect(pro.weight).toBeUndefined();
    }
  });
});
