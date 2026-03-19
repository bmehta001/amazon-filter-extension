import { describe, it, expect } from "vitest";
import type { ReviewData } from "../src/review/types";
import {
  categorizeReview,
  categorizeAllReviews,
  computeAdjustedRating,
  getProductInsights,
} from "../src/review/categories";

function review(text: string, rating: number): ReviewData {
  return { text, rating, date: new Date("2024-01-15"), verified: true, helpfulVotes: 0 };
}

describe("categorizeReview", () => {
  it("matches shipping-delivery and packaging for a shipping complaint", () => {
    const result = categorizeReview(
      review("The product arrived late and the box was damaged", 2),
    );
    expect(result.categories).toContain("shipping-delivery");
    expect(result.categories).toContain("packaging");
    expect(result.primaryCategory).toBe("shipping-delivery");
  });

  it("matches product-quality for a build quality review", () => {
    const result = categorizeReview(
      review("This is a well made, sturdy product with great build quality", 5),
    );
    expect(result.categories).toContain("product-quality");
    expect(result.primaryCategory).toBe("product-quality");
  });

  it("matches user-error for a user mistake review", () => {
    const result = categorizeReview(
      review("My fault, I didn't read the description and thought it was bigger", 2),
    );
    expect(result.categories).toContain("user-error");
    expect(result.primaryCategory).toBe("user-error");
  });

  it("matches ease-of-use for a setup review", () => {
    const result = categorizeReview(
      review("Easy to use, plug and play, great setup experience", 5),
    );
    expect(result.categories).toContain("ease-of-use");
    expect(result.primaryCategory).toBe("ease-of-use");
  });

  it("matches performance and durability for a battery/longevity review", () => {
    const result = categorizeReview(
      review("Great battery life, still works after 2 years", 5),
    );
    expect(result.categories).toContain("performance");
    expect(result.categories).toContain("durability");
  });

  it("defaults uncategorized sentences to product-quality", () => {
    const result = categorizeReview(review("Ok", 3));
    expect(result.categories).toContain("product-quality");
    expect(result.primaryCategory).toBe("product-quality");
  });

  it("matches value for a price-focused review", () => {
    const result = categorizeReview(
      review("Great deal, worth the money, affordable price", 5),
    );
    expect(result.categories).toContain("value");
    expect(result.primaryCategory).toBe("value");
  });

  it("matches customer-service for a return/refund review", () => {
    const result = categorizeReview(
      review("Had to return it, customer service was helpful with the refund", 3),
    );
    expect(result.categories).toContain("customer-service");
    expect(result.primaryCategory).toBe("customer-service");
  });
});

describe("categorizeAllReviews", () => {
  it("returns correct summaries with counts and percentages for mixed reviews", () => {
    const reviews = [
      review("Arrived late, slow shipping", 2),
      review("Great build quality, well made and sturdy", 5),
      review("Great build quality and materials", 4),
      review("Easy to use, plug and play", 5),
    ];

    const { categorized, summaries } = categorizeAllReviews(reviews);

    expect(categorized).toHaveLength(4);
    expect(summaries.length).toBeGreaterThanOrEqual(3);

    const shippingSummary = summaries.find((s) => s.categoryId === "shipping-delivery");
    expect(shippingSummary).toBeDefined();
    expect(shippingSummary!.count).toBe(1);
    expect(shippingSummary!.percentage).toBe(25);

    const qualitySummary = summaries.find((s) => s.categoryId === "product-quality");
    expect(qualitySummary).toBeDefined();
    expect(qualitySummary!.count).toBe(2);
    expect(qualitySummary!.percentage).toBe(50);
    expect(qualitySummary!.avgRating).toBe(4.5);
  });

  it("returns one summary with 100% when all reviews match the same category", () => {
    const reviews = [
      review("Easy to use, plug and play", 5),
      review("Intuitive and user friendly setup", 4),
    ];

    const { summaries } = categorizeAllReviews(reviews);

    const easeOfUse = summaries.find((s) => s.categoryId === "ease-of-use");
    expect(easeOfUse).toBeDefined();
    expect(easeOfUse!.percentage).toBe(100);
    expect(easeOfUse!.count).toBe(2);
  });

  it("returns empty summaries for an empty reviews array", () => {
    const { categorized, summaries } = categorizeAllReviews([]);
    expect(categorized).toHaveLength(0);
    expect(summaries).toHaveLength(0);
  });
});

describe("computeAdjustedRating", () => {
  it("excludes shipping reviews when shipping-delivery is ignored", () => {
    const categorized = [
      categorizeReview(review("Arrived late, slow shipping", 1)),
      categorizeReview(review("Great build quality, well made", 5)),
      categorizeReview(review("Easy to use, plug and play", 4)),
    ];

    const { adjustedRating, adjustedCount } = computeAdjustedRating(
      categorized,
      ["shipping-delivery"],
    );

    expect(adjustedCount).toBe(2);
    expect(adjustedRating).toBe(4.5);
  });

  it("excludes reviews from multiple ignored categories", () => {
    const categorized = [
      categorizeReview(review("Arrived late, slow shipping", 1)),
      categorizeReview(review("My fault, I didn't read the description", 2)),
      categorizeReview(review("Great build quality, well made", 5)),
    ];

    const { adjustedRating, adjustedCount } = computeAdjustedRating(
      categorized,
      ["shipping-delivery", "user-error"],
    );

    expect(adjustedCount).toBe(1);
    expect(adjustedRating).toBe(5);
  });

  it("leaves rating unchanged when ignored category has no matches", () => {
    const categorized = [
      categorizeReview(review("Great build quality, well made", 5)),
      categorizeReview(review("Easy to use, plug and play", 4)),
    ];

    const original = computeAdjustedRating(categorized, []);
    const withIgnored = computeAdjustedRating(categorized, ["shipping-delivery"]);

    expect(withIgnored.adjustedRating).toBe(original.adjustedRating);
    expect(withIgnored.adjustedCount).toBe(original.adjustedCount);
  });

  it("returns 0 rating and 0 count when all reviews are ignored", () => {
    const categorized = [
      categorizeReview(review("Arrived late, slow shipping", 1)),
      categorizeReview(review("Customer service gave a refund for the return", 2)),
    ];

    const { adjustedRating, adjustedCount } = computeAdjustedRating(
      categorized,
      ["shipping-delivery", "customer-service"],
    );

    expect(adjustedCount).toBe(0);
    expect(adjustedRating).toBe(0);
  });
});

describe("getProductInsights", () => {
  it("computes adjusted rating excluding shipping reviews in full pipeline", () => {
    const reviews = [
      review("Arrived late, slow shipping", 1),
      review("Great build quality, well made", 5),
      review("Easy to use, plug and play", 4),
    ];

    const insights = getProductInsights(reviews, ["shipping-delivery"]);

    expect(insights.categorizedReviews).toHaveLength(3);
    expect(insights.categorySummaries.length).toBeGreaterThan(0);
    expect(insights.adjustedReviewCount).toBe(2);
    expect(insights.adjustedRating).toBe(4.5);
  });

  it("returns normal average when no categories are ignored", () => {
    const reviews = [
      review("Arrived late, slow shipping", 1),
      review("Great build quality, well made", 5),
    ];

    const insights = getProductInsights(reviews, []);

    expect(insights.adjustedReviewCount).toBe(2);
    expect(insights.adjustedRating).toBe(3);
  });
});
