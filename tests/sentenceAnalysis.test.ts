import { describe, it, expect } from "vitest";
import type { ReviewData, CategorizedReview } from "../src/review/types";
import {
  splitIntoSentences,
  detectImpliedRating,
  categorizeSentence,
  categorizeReview,
  computeAdjustedRating,
  computeTopicScores,
  computeTopicTrends,
  annotateTrends,
  getProductInsights,
} from "../src/review/categories";

function review(text: string, rating: number, date = "2025-06-15"): ReviewData {
  return { text, rating, date: new Date(date), verified: true, helpfulVotes: 0 };
}

// ── Sentence Splitting ──────────────────────────────────────────────

describe("splitIntoSentences", () => {
  it("splits on periods", () => {
    const result = splitIntoSentences("First sentence. Second sentence. Third one.");
    expect(result).toEqual(["First sentence.", "Second sentence.", "Third one."]);
  });

  it("splits on exclamation and question marks", () => {
    const result = splitIntoSentences("Great product! Worth the price? Absolutely.");
    expect(result).toEqual(["Great product!", "Worth the price?", "Absolutely."]);
  });

  it("preserves abbreviations (Mr., Dr., etc.)", () => {
    const result = splitIntoSentences("Mr. Smith said it was good. Dr. Jones agreed.");
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("Mr.");
    expect(result[1]).toContain("Dr.");
  });

  it("preserves decimal numbers (4.5 stars)", () => {
    const result = splitIntoSentences("I give this 4.5 stars. It's amazing.");
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("4.5");
  });

  it("handles ellipses without extra splits", () => {
    const result = splitIntoSentences("I thought it was great... but then it broke.");
    expect(result).toHaveLength(1);
  });

  it("returns empty array for empty/whitespace input", () => {
    expect(splitIntoSentences("")).toEqual([]);
    expect(splitIntoSentences("   ")).toEqual([]);
  });

  it("returns single sentence for text without sentence-ending punctuation", () => {
    const result = splitIntoSentences("No punctuation here");
    expect(result).toEqual(["No punctuation here"]);
  });
});

// ── Implied Rating Detection ────────────────────────────────────────

describe("detectImpliedRating", () => {
  it("detects 'would have given 5 stars except for'", () => {
    expect(detectImpliedRating("I would have given 5 stars except for the shipping")).toBe(5);
  });

  it("detects 'would have said 4 stars but'", () => {
    expect(detectImpliedRating("Would have said 4 stars but the battery dies fast")).toBe(4);
  });

  it("detects 'this is a 5 star product except for'", () => {
    expect(detectImpliedRating("This is a 5 star product except for the packaging")).toBe(5);
  });

  it("detects 'I'd give 5 stars but'", () => {
    expect(detectImpliedRating("I'd give 5 stars but the size was wrong")).toBe(5);
  });

  it("detects 'would be 5 stars but'", () => {
    expect(detectImpliedRating("Would be 5 stars but for the slow delivery")).toBe(5);
  });

  it("returns null for normal review text", () => {
    expect(detectImpliedRating("Great product, love it!")).toBeNull();
  });

  it("returns null for text without star patterns", () => {
    expect(detectImpliedRating("The shipping was slow and the product broke")).toBeNull();
  });

  it("rejects rating outside 1-5 range", () => {
    expect(detectImpliedRating("Would have given 0 stars except for nothing")).toBeNull();
    expect(detectImpliedRating("Would have given 9 stars except for nothing")).toBeNull();
  });
});

// ── Sentence-Level Categorization ───────────────────────────────────

describe("categorizeSentence", () => {
  it("tags a shipping sentence", () => {
    expect(categorizeSentence("The shipping was slow and delivery was late")).toContain("shipping-delivery");
  });

  it("tags a product quality sentence", () => {
    expect(categorizeSentence("The build quality is excellent and sturdy")).toContain("product-quality");
  });

  it("returns empty array for uncategorized sentence (default applied at review level)", () => {
    expect(categorizeSentence("OK")).toHaveLength(0);
  });

  it("tags multiple categories for a multi-topic sentence", () => {
    const cats = categorizeSentence("The cheap price makes up for the flimsy build quality");
    expect(cats).toContain("value");
    expect(cats).toContain("product-quality");
  });
});

// ── Review Categorization with Sentences ────────────────────────────

describe("categorizeReview (sentence-level)", () => {
  it("populates sentence-level breakdown", () => {
    const r = review("The shipping was slow. But the product quality is amazing.", 2);
    const result = categorizeReview(r);

    expect(result.sentences).toHaveLength(2);
    expect(result.sentences[0].categories).toContain("shipping-delivery");
    expect(result.sentences[1].categories).toContain("product-quality");
  });

  it("assigns equal weight to each sentence", () => {
    const r = review("Sentence one. Sentence two. Sentence three.", 4);
    const result = categorizeReview(r);

    expect(result.sentences).toHaveLength(3);
    for (const s of result.sentences) {
      expect(s.weight).toBeCloseTo(1 / 3, 5);
    }
  });

  it("defaults uncategorized sentences to product-quality", () => {
    const r = review("It's fine. Nothing special.", 3);
    const result = categorizeReview(r);

    for (const s of result.sentences) {
      expect(s.categories).toContain("product-quality");
    }
    expect(result.categories).toContain("product-quality");
  });

  it("detects implied rating on multi-topic review", () => {
    const r = review("I would have given 5 stars except for the shipping. Product quality is amazing.", 2);
    const result = categorizeReview(r);

    expect(result.impliedRating).toBe(5);
    expect(result.sentences.length).toBeGreaterThanOrEqual(2);
  });

  it("sets impliedRating to null for normal reviews", () => {
    const r = review("Great quality headphones. Sound is excellent.", 5);
    expect(categorizeReview(r).impliedRating).toBeNull();
  });
});

// ── Adjusted Rating (sentence-level weighting) ──────────────────────

describe("computeAdjustedRating (sentence-level)", () => {
  it("uses sentence weights to partially exclude multi-topic reviews", () => {
    // Review says "Shipping was slow. But the product quality is great." rated 3★
    // When ignoring shipping, only the quality sentence (weight=0.5) contributes
    const categorized = [
      categorizeReview(review("Shipping was slow. But the product quality is great.", 3)),
      categorizeReview(review("Easy to use and intuitive.", 5)),
    ];

    const { adjustedRating } = computeAdjustedRating(categorized, ["shipping-delivery"]);

    // Review 1: 1 of 2 sentences kept (quality), weight=0.5, rating=3
    // Review 2: 1 of 1 sentences kept, weight=1.0, rating=5
    // Weighted avg = (0.5*3 + 1.0*5) / (0.5 + 1.0) = 6.5/1.5 ≈ 4.33
    expect(adjustedRating).toBeCloseTo(4.33, 1);
  });

  it("uses implied rating for non-excepted topics", () => {
    // "I would have given 5 stars except for shipping. Quality is great." rated 1★
    // Ignoring shipping → quality sentence uses implied 5★ instead of actual 1★
    const categorized = [
      categorizeReview(review("I would have given 5 stars except for the shipping. Quality is great.", 1)),
    ];

    const { adjustedRating } = computeAdjustedRating(categorized, ["shipping-delivery"]);

    // 1 sentence kept (quality), implied rating = 5
    expect(adjustedRating).toBe(5);
  });

  it("falls through to actual rating when no implied rating exists", () => {
    const categorized = [
      categorizeReview(review("Shipping was terrible. Product broke.", 1)),
    ];

    const { adjustedRating } = computeAdjustedRating(categorized, ["shipping-delivery"]);

    // 1 of 2 sentences kept (product-quality: "Product broke"), actual rating 1★
    expect(adjustedRating).toBe(1);
  });

  it("returns simple average when no categories are ignored", () => {
    const categorized = [
      categorizeReview(review("Great quality.", 5)),
      categorizeReview(review("Terrible shipping.", 1)),
    ];

    const { adjustedRating, adjustedCount } = computeAdjustedRating(categorized, []);
    expect(adjustedRating).toBe(3);
    expect(adjustedCount).toBe(2);
  });

  it("excludes reviews entirely when all sentences are in ignored categories", () => {
    const categorized = [
      categorizeReview(review("Shipping was late and delivery was slow.", 1)),
      categorizeReview(review("Great quality.", 5)),
    ];

    const { adjustedRating, adjustedCount } = computeAdjustedRating(
      categorized,
      ["shipping-delivery"],
    );

    expect(adjustedCount).toBe(1);
    expect(adjustedRating).toBe(5);
  });
});

// ── Per-Topic Scores ────────────────────────────────────────────────

describe("computeTopicScores", () => {
  it("computes per-topic average ratings", () => {
    const categorized = [
      categorizeReview(review("Great build quality.", 5)),
      categorizeReview(review("Terrible build quality. Flimsy materials.", 1)),
      categorizeReview(review("Easy to use.", 4)),
    ];

    const scores = computeTopicScores(categorized);

    const qualityScore = scores.find((s) => s.categoryId === "product-quality");
    expect(qualityScore).toBeDefined();
    expect(qualityScore!.reviewMentions).toBe(2);
    // avg of 5 and 1 = 3.0
    expect(qualityScore!.avgRating).toBe(3);
    expect(qualityScore!.sentiment).toBe("mixed");

    const easeScore = scores.find((s) => s.categoryId === "ease-of-use");
    expect(easeScore).toBeDefined();
    expect(easeScore!.reviewMentions).toBe(1);
    expect(easeScore!.sentiment).toBe("positive");
  });

  it("sorts by review mentions descending", () => {
    const categorized = [
      categorizeReview(review("Great quality.", 5)),
      categorizeReview(review("Good quality.", 4)),
      categorizeReview(review("Easy setup.", 5)),
    ];

    const scores = computeTopicScores(categorized);
    // product-quality has 2 mentions, ease-of-use has 1
    expect(scores[0].reviewMentions).toBeGreaterThanOrEqual(scores[scores.length - 1].reviewMentions);
  });

  it("assigns correct sentiment labels", () => {
    const categorized = [
      categorizeReview(review("Great quality.", 5)),   // positive
      categorizeReview(review("Terrible shipping.", 1)), // negative
    ];

    const scores = computeTopicScores(categorized);
    const quality = scores.find((s) => s.categoryId === "product-quality");
    const shipping = scores.find((s) => s.categoryId === "shipping-delivery");

    expect(quality?.sentiment).toBe("positive");
    expect(shipping?.sentiment).toBe("negative");
  });
});

// ── Temporal Trends ─────────────────────────────────────────────────

describe("computeTopicTrends", () => {
  it("groups reviews into quarterly windows", () => {
    const categorized = [
      categorizeReview(review("Great quality.", 5, "2025-01-15")),
      categorizeReview(review("Good quality.", 4, "2025-02-10")),
      categorizeReview(review("Bad quality.", 1, "2025-07-20")),
    ];

    const windows = computeTopicTrends(categorized);

    expect(windows.length).toBeGreaterThanOrEqual(2);
    // First window (Q1 2025) should have 2 reviews
    expect(windows[0].reviewCount).toBe(2);
    // Last window (Q3 2025) should have 1 review
    expect(windows[windows.length - 1].reviewCount).toBe(1);
  });

  it("returns empty for fewer than 2 dated reviews", () => {
    const categorized = [
      categorizeReview(review("Great quality.", 5)),
    ];
    expect(computeTopicTrends(categorized)).toEqual([]);
  });

  it("computes per-topic score per window", () => {
    const categorized = [
      categorizeReview(review("Great quality.", 5, "2025-01-15")),
      categorizeReview(review("Bad quality.", 1, "2025-07-20")),
    ];

    const windows = computeTopicTrends(categorized);
    // Q1 should have quality score ~5, Q3 should have quality score ~1
    const q1Score = windows[0].scores.get("product-quality");
    const lastScore = windows[windows.length - 1].scores.get("product-quality");

    expect(q1Score).toBeGreaterThan(4);
    expect(lastScore).toBeLessThan(2);
  });
});

describe("annotateTrends", () => {
  it("marks rising trend when latest window is >0.5 higher", () => {
    const scores = computeTopicScores([
      categorizeReview(review("Bad quality.", 1, "2025-01-15")),
      categorizeReview(review("Great quality.", 5, "2025-07-20")),
    ]);

    const windows = computeTopicTrends([
      categorizeReview(review("Bad quality.", 1, "2025-01-15")),
      categorizeReview(review("Great quality.", 5, "2025-07-20")),
    ]);

    const annotated = annotateTrends(scores, windows);
    const quality = annotated.find((s) => s.categoryId === "product-quality");
    expect(quality?.trend).toBe("rising");
  });

  it("marks falling trend when latest window is >0.5 lower", () => {
    const categorized = [
      categorizeReview(review("Great quality.", 5, "2025-01-15")),
      categorizeReview(review("Terrible quality.", 1, "2025-07-20")),
    ];

    const scores = computeTopicScores(categorized);
    const windows = computeTopicTrends(categorized);
    const annotated = annotateTrends(scores, windows);
    const quality = annotated.find((s) => s.categoryId === "product-quality");
    expect(quality?.trend).toBe("falling");
  });

  it("marks stable when change is within 0.5", () => {
    const categorized = [
      categorizeReview(review("Great quality.", 5, "2025-01-15")),
      categorizeReview(review("Great quality.", 5, "2025-07-20")),
    ];

    const scores = computeTopicScores(categorized);
    const windows = computeTopicTrends(categorized);
    const annotated = annotateTrends(scores, windows);
    const quality = annotated.find((s) => s.categoryId === "product-quality");
    expect(quality?.trend).toBe("stable");
  });

  it("returns scores unchanged when fewer than 2 windows", () => {
    const scores = computeTopicScores([
      categorizeReview(review("Great quality.", 5)),
    ]);
    const annotated = annotateTrends(scores, []);
    expect(annotated).toEqual(scores);
  });
});

// ── Full Pipeline ───────────────────────────────────────────────────

describe("getProductInsights (sentence-level)", () => {
  it("includes topicScores in the result", () => {
    const reviews = [
      review("Great quality product.", 5),
      review("Terrible shipping was slow.", 1),
      review("Easy to set up.", 4),
    ];

    const insights = getProductInsights(reviews, []);
    expect(insights.topicScores.length).toBeGreaterThan(0);
    expect(insights.topicScores.find((s) => s.categoryId === "product-quality")).toBeDefined();
  });

  it("includes trendWindows when reviews have different dates", () => {
    const reviews = [
      review("Great quality.", 5, "2025-01-15"),
      review("Bad quality.", 1, "2025-07-20"),
    ];

    const insights = getProductInsights(reviews, []);
    expect(insights.trendWindows.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves adjusted rating accuracy with sentence-level weighting", () => {
    // Classic case: 1★ review about shipping + quality, ignore shipping
    const reviews = [
      review("Shipping was terrible. But the product quality is excellent.", 1),
      review("Great quality.", 5),
    ];

    const insights = getProductInsights(reviews, ["shipping-delivery"]);

    // Review 1: quality sentence (weight=0.5) at 1★, review 2: quality (weight=1.0) at 5★
    // Weighted: (0.5*1 + 1.0*5) / 1.5 = 5.5/1.5 ≈ 3.67
    expect(insights.adjustedRating).toBeCloseTo(3.67, 1);
    expect(insights.adjustedReviewCount).toBe(2); // both contribute
  });

  it("uses implied rating to correct the shipping-tanked-score problem", () => {
    // User says "would have given 5 stars except for shipping" but rated 1★
    const reviews = [
      review("I would have given 5 stars except for the shipping. Product quality is top notch.", 1),
      review("Great quality.", 5),
    ];

    const insights = getProductInsights(reviews, ["shipping-delivery"]);

    // Review 1: quality sentence uses implied 5★, review 2: 5★
    // Both at 5★ → adjusted ≈ 5.0
    expect(insights.adjustedRating).toBe(5);
  });
});
