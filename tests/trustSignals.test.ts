import { describe, it, expect } from "vitest";
import {
  analyzeRatingShape,
  analyzeVerifiedRatio,
  detectIncentivizedLanguage,
  detectGenericPraise,
  analyzeReviewLengthDistribution,
  detectCopyPasteReviews,
  detectSentimentMismatch,
  analyzeHelpfulVotes,
  detectDateClustering,
  analyzeRatingCountAnomaly,
  computeAllTrustSignals,
} from "../src/review/trustSignals";
import { computeTrustScore } from "../src/review/trustScore";
import type {
  HistogramData,
  ReviewData,
  ProductReviewData,
  CategorizedReview,
} from "../src/review/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReview(overrides: Partial<ReviewData> = {}): ReviewData {
  return {
    text: "This product works well. The build quality is solid and I'm happy with my purchase.",
    rating: 4,
    date: new Date("2024-06-15"),
    verified: true,
    helpfulVotes: 3,
    ...overrides,
  };
}

function makeHistogram(overrides: Partial<HistogramData> = {}): HistogramData {
  return { five: 50, four: 25, three: 12, two: 8, one: 5, ...overrides };
}

function makeProductData(overrides: Partial<ProductReviewData> = {}): ProductReviewData {
  return {
    asin: "B001TEST",
    histogram: makeHistogram(),
    reviews: [
      makeReview({ date: new Date("2024-01-10") }),
      makeReview({ date: new Date("2024-03-15"), rating: 5, text: "Excellent noise cancellation. Blocks out airplane noise perfectly." }),
      makeReview({ date: new Date("2024-05-20"), rating: 3, text: "Battery life is mediocre. Only lasts about 4 hours." }),
      makeReview({ date: new Date("2024-07-01"), rating: 5, text: "Comfortable for long wearing sessions. The ear cups are soft." }),
      makeReview({ date: new Date("2024-09-12"), rating: 4, text: "Good sound quality but the Bluetooth connection drops occasionally." }),
    ],
    totalRatings: 500,
    averageRating: 4.2,
    ...overrides,
  };
}

function makeCategorized(review: ReviewData): CategorizedReview {
  return {
    review,
    categories: ["product-quality"],
    primaryCategory: "product-quality",
    sentences: [{ text: review.text, categories: ["product-quality"], weight: 1 }],
    impliedRating: null,
  };
}

// ---------------------------------------------------------------------------
// Signal 1: Rating Distribution Shape
// ---------------------------------------------------------------------------

describe("analyzeRatingShape", () => {
  it("returns no deduction for healthy distribution", () => {
    const result = analyzeRatingShape(makeHistogram(), 500);
    expect(result.deduction).toBe(0);
  });

  it("flags high 5★ with very low 4★ (fake campaign pattern)", () => {
    const histogram = makeHistogram({ five: 85, four: 2, three: 3, two: 5, one: 5 });
    const result = analyzeRatingShape(histogram, 100);
    expect(result.deduction).toBeGreaterThan(0);
    expect(result.reason).toContain("4★");
  });

  it("does NOT flag high 5★ when 4★ is healthy (genuine great product)", () => {
    // AirPods-like distribution: 75% 5★, 15% 4★
    const histogram = makeHistogram({ five: 75, four: 15, three: 5, two: 3, one: 2 });
    const result = analyzeRatingShape(histogram, 1000);
    expect(result.deduction).toBe(0);
  });

  it("flags bimodal distribution (competing campaigns)", () => {
    const histogram = makeHistogram({ five: 55, four: 3, three: 2, two: 5, one: 35 });
    const result = analyzeRatingShape(histogram, 200);
    expect(result.deduction).toBeGreaterThan(0);
    expect(result.reason).toContain("Polarized");
  });

  it("returns no deduction for insufficient data", () => {
    const result = analyzeRatingShape(null, 0);
    expect(result.deduction).toBe(0);
  });

  it("has lower confidence with fewer total ratings", () => {
    const histogram = makeHistogram({ five: 90, four: 2, three: 3, two: 3, one: 2 });
    const low = analyzeRatingShape(histogram, 15);
    const high = analyzeRatingShape(histogram, 500);
    expect(low.confidence).toBeLessThan(high.confidence);
  });
});

// ---------------------------------------------------------------------------
// Signal 2: Verified Purchase Ratio
// ---------------------------------------------------------------------------

describe("analyzeVerifiedRatio", () => {
  it("returns no deduction when most reviews are verified", () => {
    const reviews = [
      makeReview({ verified: true }),
      makeReview({ verified: true }),
      makeReview({ verified: true }),
      makeReview({ verified: false }),
    ];
    const result = analyzeVerifiedRatio(reviews);
    expect(result.deduction).toBe(0);
  });

  it("flags low verified ratio", () => {
    const reviews = [
      makeReview({ verified: false }),
      makeReview({ verified: false }),
      makeReview({ verified: false }),
      makeReview({ verified: true }),
    ];
    const result = analyzeVerifiedRatio(reviews);
    expect(result.deduction).toBeGreaterThan(0);
    expect(result.reason).toContain("25%");
  });

  it("max deduction when zero verified", () => {
    const reviews = Array.from({ length: 8 }, () => makeReview({ verified: false }));
    const result = analyzeVerifiedRatio(reviews);
    expect(result.deduction).toBe(15);
  });

  it("skips with too few reviews", () => {
    const result = analyzeVerifiedRatio([makeReview(), makeReview()]);
    expect(result.deduction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 3: Incentivized Language
// ---------------------------------------------------------------------------

describe("detectIncentivizedLanguage", () => {
  it("detects 'received free' language", () => {
    const reviews = [
      makeReview({ text: "I received this product free in exchange for an honest review." }),
      makeReview({ text: "Great headphones, sound quality is amazing." }),
    ];
    const result = detectIncentivizedLanguage(reviews);
    expect(result.deduction).toBeGreaterThan(0);
    expect(result.reason).toContain("1 of 2");
  });

  it("returns no deduction for normal reviews", () => {
    const reviews = [
      makeReview({ text: "Bought this for my kitchen. Works perfectly." }),
      makeReview({ text: "Good value for the price. Shipping was fast." }),
    ];
    const result = detectIncentivizedLanguage(reviews);
    expect(result.deduction).toBe(0);
  });

  it("higher deduction when most reviews are incentivized", () => {
    const reviews = [
      makeReview({ text: "Received free sample. Honest review: it's decent." }),
      makeReview({ text: "Complimentary item provided by the seller. It works." }),
      makeReview({ text: "I got a free sample of this. Not bad overall." }),
    ];
    const result = detectIncentivizedLanguage(reviews);
    expect(result.deduction).toBeGreaterThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// Signal 4: Generic Praise
// ---------------------------------------------------------------------------

describe("detectGenericPraise", () => {
  it("flags short generic positive reviews", () => {
    const reviews = [
      makeReview({ rating: 5, text: "Great product! Love it. Highly recommend." }),
      makeReview({ rating: 5, text: "Amazing product, love this! Five stars." }),
      makeReview({ rating: 5, text: "Best ever, love it! Works great." }),
    ];
    const result = detectGenericPraise(reviews);
    expect(result.deduction).toBeGreaterThan(0);
  });

  it("does NOT flag detailed positive reviews", () => {
    const reviews = [
      makeReview({ rating: 5, text: "The noise cancellation on these headphones is incredible. I use them on my daily commute on the subway and they block out all the train noise. Battery lasts about 30 hours which is more than enough for a week of commuting." }),
      makeReview({ rating: 5, text: "I've been using this blender for three months now. The 1200W motor handles frozen fruit without any issues. The self-cleaning mode is a game changer — just add soap and water and blend for 30 seconds." }),
    ];
    const result = detectGenericPraise(reviews);
    expect(result.deduction).toBe(0);
  });

  it("ignores negative reviews when checking for generic praise", () => {
    const reviews = [
      makeReview({ rating: 2, text: "Great product! Love it. Highly recommend." }), // negative rating, generic text = ignored
      makeReview({ rating: 4, text: "Solid build quality. The aluminum frame feels premium and the hinges are smooth." }),
    ];
    const result = detectGenericPraise(reviews);
    expect(result.deduction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 5: Review Length Uniformity
// ---------------------------------------------------------------------------

describe("analyzeReviewLengthDistribution", () => {
  it("flags uniform-length reviews (template)", () => {
    // All reviews ~40-45 chars (very uniform)
    const reviews = [
      makeReview({ text: "Great product works really well for me." }),
      makeReview({ text: "Amazing quality and very fast shipping." }),
      makeReview({ text: "Love this item it is exactly perfect." }),
      makeReview({ text: "Best purchase ever would recommend it." }),
      makeReview({ text: "Works great and arrived quickly today." }),
    ];
    const result = analyzeReviewLengthDistribution(reviews);
    expect(result.deduction).toBeGreaterThan(0);
  });

  it("returns no deduction for varied-length reviews", () => {
    const reviews = [
      makeReview({ text: "Great!" }), // very short
      makeReview({ text: "This is a decent product. Works as advertised." }), // medium
      makeReview({ text: "I've been using this blender for three months now. The motor is powerful enough to crush ice and frozen fruit. The cleanup is easy because the jar is dishwasher safe. My only complaint is that it's a bit loud, but that's expected for a 1200W motor. Overall I'd recommend it for anyone who makes smoothies regularly." }), // very long
      makeReview({ text: "Solid product. Happy with purchase." }), // short
    ];
    const result = analyzeReviewLengthDistribution(reviews);
    expect(result.deduction).toBe(0);
  });

  it("skips with too few reviews", () => {
    const result = analyzeReviewLengthDistribution([makeReview(), makeReview()]);
    expect(result.deduction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 6: Copy-Paste Detection
// ---------------------------------------------------------------------------

describe("detectCopyPasteReviews", () => {
  it("flags near-duplicate reviews", () => {
    const reviews = [
      makeReview({ text: "This product is amazing and works perfectly. I would recommend it to anyone looking for a great deal." }),
      makeReview({ text: "This product is amazing and works perfectly. I would recommend it to everyone looking for a great deal." }),
      makeReview({ text: "Totally different review about the battery life being short and disappointing." }),
    ];
    const result = detectCopyPasteReviews(reviews);
    expect(result.deduction).toBeGreaterThan(0);
    expect(result.reason).toContain("pair");
  });

  it("returns no deduction for unique reviews", () => {
    const reviews = [
      makeReview({ text: "The noise cancellation is top notch. I use these on my commute daily." }),
      makeReview({ text: "Battery life could be better. Only lasts about 4 hours with ANC on." }),
      makeReview({ text: "Comfortable for long periods. The ear cups are soft and don't squeeze." }),
    ];
    const result = detectCopyPasteReviews(reviews);
    expect(result.deduction).toBe(0);
  });

  it("skips very short reviews to avoid false positives", () => {
    const reviews = [
      makeReview({ text: "Great!" }),
      makeReview({ text: "Great!" }),
      makeReview({ text: "Good product." }),
    ];
    // These are too short (< 5 tokens) to be meaningfully compared
    const result = detectCopyPasteReviews(reviews);
    expect(result.deduction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 7: Sentiment-Rating Mismatch
// ---------------------------------------------------------------------------

describe("detectSentimentMismatch", () => {
  it("flags 5★ review with negative text", () => {
    const reviews = [
      makeReview({ rating: 5, text: "This is terrible. Worst product I ever bought. Broken and useless." }),
      makeReview({ rating: 4, text: "Good product overall." }),
    ];
    const categorized = reviews.map(makeCategorized);
    const result = detectSentimentMismatch(reviews, categorized);
    expect(result.deduction).toBeGreaterThan(0);
  });

  it("flags 1★ review with positive text", () => {
    const reviews = [
      makeReview({ rating: 1, text: "Amazing product, love it. Perfect in every way. Best purchase ever." }),
      makeReview({ rating: 4, text: "Decent quality for the price." }),
    ];
    const categorized = reviews.map(makeCategorized);
    const result = detectSentimentMismatch(reviews, categorized);
    expect(result.deduction).toBeGreaterThan(0);
  });

  it("no deduction when ratings match sentiment", () => {
    const reviews = [
      makeReview({ rating: 5, text: "Amazing product. Love the build quality and sound." }),
      makeReview({ rating: 2, text: "Terrible quality. Broke after one week. Returning it." }),
    ];
    const categorized = reviews.map(makeCategorized);
    const result = detectSentimentMismatch(reviews, categorized);
    expect(result.deduction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 8: Helpful Vote Distribution
// ---------------------------------------------------------------------------

describe("analyzeHelpfulVotes", () => {
  it("flags zero helpful votes on popular product", () => {
    const reviews = Array.from({ length: 5 }, () => makeReview({ helpfulVotes: 0 }));
    const result = analyzeHelpfulVotes(reviews, 500);
    expect(result.deduction).toBeGreaterThan(0);
  });

  it("no deduction when reviews have helpful votes", () => {
    const reviews = [
      makeReview({ helpfulVotes: 5 }),
      makeReview({ helpfulVotes: 0 }),
      makeReview({ helpfulVotes: 12 }),
    ];
    const result = analyzeHelpfulVotes(reviews, 500);
    expect(result.deduction).toBe(0);
  });

  it("no deduction for low-volume products", () => {
    const reviews = Array.from({ length: 3 }, () => makeReview({ helpfulVotes: 0 }));
    const result = analyzeHelpfulVotes(reviews, 20);
    expect(result.deduction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 9: Date Clustering
// ---------------------------------------------------------------------------

describe("detectDateClustering", () => {
  it("flags reviews clustered in same week", () => {
    const reviews = [
      makeReview({ date: new Date("2024-06-01") }),
      makeReview({ date: new Date("2024-06-02") }),
      makeReview({ date: new Date("2024-06-03") }),
      makeReview({ date: new Date("2024-06-04") }),
      makeReview({ date: new Date("2024-06-05") }),
    ];
    const result = detectDateClustering(reviews);
    expect(result.deduction).toBeGreaterThan(0);
    expect(result.reason).toContain("100%");
  });

  it("no deduction for well-spread reviews", () => {
    const reviews = [
      makeReview({ date: new Date("2024-01-15") }),
      makeReview({ date: new Date("2024-03-20") }),
      makeReview({ date: new Date("2024-06-10") }),
      makeReview({ date: new Date("2024-08-05") }),
      makeReview({ date: new Date("2024-11-30") }),
    ];
    const result = detectDateClustering(reviews);
    expect(result.deduction).toBe(0);
  });

  it("skips invalid dates", () => {
    const reviews = [
      makeReview({ date: new Date(0) }),
      makeReview({ date: new Date(0) }),
      makeReview({ date: new Date(0) }),
    ];
    const result = detectDateClustering(reviews);
    expect(result.deduction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 10: Rating Count Anomaly
// ---------------------------------------------------------------------------

describe("analyzeRatingCountAnomaly", () => {
  it("flags when displayed avg differs from histogram avg", () => {
    // Histogram implies ~4.2 avg but displayed says 4.8
    const histogram = makeHistogram({ five: 50, four: 25, three: 12, two: 8, one: 5 });
    const result = analyzeRatingCountAnomaly([], 500, 4.8, histogram);
    expect(result.deduction).toBeGreaterThan(0);
    expect(result.reason).toContain("differs");
  });

  it("no deduction when averages match", () => {
    const histogram = makeHistogram({ five: 50, four: 25, three: 12, two: 8, one: 5 });
    // Computed: (50*5+25*4+12*3+8*2+5*1)/100 = (250+100+36+16+5)/100 = 4.07
    const result = analyzeRatingCountAnomaly([], 500, 4.1, histogram);
    expect(result.deduction).toBe(0);
  });

  it("skips with insufficient data", () => {
    const result = analyzeRatingCountAnomaly([], 10, 4.5, null);
    expect(result.deduction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Composite: computeAllTrustSignals
// ---------------------------------------------------------------------------

describe("computeAllTrustSignals", () => {
  it("returns 10 signals", () => {
    const data = makeProductData();
    const signals = computeAllTrustSignals(data);
    expect(signals).toHaveLength(10);
  });

  it("all signals have required fields", () => {
    const data = makeProductData();
    const signals = computeAllTrustSignals(data);
    for (const s of signals) {
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("deduction");
      expect(s).toHaveProperty("maxDeduction");
      expect(s).toHaveProperty("confidence");
      expect(s).toHaveProperty("severity");
      expect(s.deduction).toBeGreaterThanOrEqual(0);
      expect(s.deduction).toBeLessThanOrEqual(s.maxDeduction);
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Composite Trust Score
// ---------------------------------------------------------------------------

describe("computeTrustScore", () => {
  it("genuine product scores high (trustworthy)", () => {
    const data = makeProductData({
      histogram: makeHistogram({ five: 65, four: 20, three: 8, two: 4, one: 3 }),
      reviews: [
        makeReview({ date: new Date("2024-01-10"), verified: true, helpfulVotes: 5, text: "The noise cancellation on these is incredible. I use them on the subway and they block everything out. Battery lasts about 30 hours." }),
        makeReview({ date: new Date("2024-03-15"), verified: true, helpfulVotes: 12, rating: 5, text: "Comfortable for long flights. The ear cups are soft memory foam. Sound quality is crisp with good bass." }),
        makeReview({ date: new Date("2024-05-20"), verified: true, helpfulVotes: 3, rating: 3, text: "The Bluetooth connection drops when I walk more than 10 feet from my phone. Otherwise decent." }),
        makeReview({ date: new Date("2024-07-01"), verified: true, helpfulVotes: 8, rating: 5, text: "Been using these daily for 6 months. Still look and work like new. The carrying case is a nice touch." }),
        makeReview({ date: new Date("2024-09-12"), verified: false, helpfulVotes: 2, rating: 4, text: "Good value for the price. Not as good as Sony XM5 but 60% cheaper. The app is decent." }),
      ],
      totalRatings: 2847,
      averageRating: 4.3,
    });

    const result = computeTrustScore(data);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.label).toBe("trustworthy");
    expect(result.color).toBe("green");
    expect(result.positiveSignals.length).toBeGreaterThan(0);
  });

  it("obviously fake product scores low (suspicious)", () => {
    const data = makeProductData({
      histogram: makeHistogram({ five: 95, four: 1, three: 1, two: 1, one: 2 }),
      reviews: [
        makeReview({ date: new Date("2024-06-01"), verified: false, helpfulVotes: 0, rating: 5, text: "Great product! Love it! Highly recommend! Five stars! Amazing!" }),
        makeReview({ date: new Date("2024-06-01"), verified: false, helpfulVotes: 0, rating: 5, text: "Great product! Love it! Highly recommend! Works great!" }),
        makeReview({ date: new Date("2024-06-02"), verified: false, helpfulVotes: 0, rating: 5, text: "Love this! Amazing product! Highly recommend! Best ever!" }),
        makeReview({ date: new Date("2024-06-02"), verified: false, helpfulVotes: 0, rating: 5, text: "Great product! Five stars! Love it! Would buy again!" }),
        makeReview({ date: new Date("2024-06-03"), verified: false, helpfulVotes: 0, rating: 5, text: "Amazing product! Love this! Works perfectly! Highly recommend!" }),
        makeReview({ date: new Date("2024-06-03"), verified: false, helpfulVotes: 0, rating: 5, text: "Best product! Love it! Great product! Five stars!" }),
        makeReview({ date: new Date("2024-06-03"), verified: false, helpfulVotes: 0, rating: 5, text: "Love this product! Highly recommend! Amazing! Great!" }),
        makeReview({ date: new Date("2024-06-04"), verified: false, helpfulVotes: 0, rating: 5, text: "Great product! Love it! Highly recommend! Perfect!" }),
      ],
      totalRatings: 300,
      averageRating: 4.9,
    });

    const result = computeTrustScore(data);
    expect(result.score).toBeLessThan(50);
    expect(["suspicious", "questionable"]).toContain(result.label);
    // Should have multiple negative signals
    const negativeSignals = result.signals.filter((s) => s.deduction > 0);
    expect(negativeSignals.length).toBeGreaterThanOrEqual(3);
  });

  it("mixed product scores in middle range", () => {
    const data = makeProductData({
      histogram: makeHistogram({ five: 82, four: 3, three: 3, two: 5, one: 7 }),
      reviews: [
        makeReview({ date: new Date("2024-06-10"), verified: true, helpfulVotes: 0, rating: 5, text: "Great product! Love it. Highly recommend!" }),
        makeReview({ date: new Date("2024-06-11"), verified: false, helpfulVotes: 0, rating: 5, text: "Amazing product! Five stars! Love it!" }),
        makeReview({ date: new Date("2024-06-12"), verified: false, helpfulVotes: 0, rating: 5, text: "Highly recommend this product! Amazing quality!" }),
        makeReview({ date: new Date("2024-08-01"), verified: true, helpfulVotes: 1, rating: 2, text: "Stopped working after 2 months. Disappointing. Terrible quality." }),
        makeReview({ date: new Date("2024-10-12"), verified: true, helpfulVotes: 0, rating: 5, text: "The motor is powerful enough for ice. Blends smoothly. Cleanup is easy with the self-clean mode." }),
      ],
      totalRatings: 200,
      averageRating: 4.4,
    });

    const result = computeTrustScore(data);
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(85);
  });

  it("returns all required fields", () => {
    const result = computeTrustScore(makeProductData());
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("label");
    expect(result).toHaveProperty("color");
    expect(result).toHaveProperty("signals");
    expect(result).toHaveProperty("positiveSignals");
    expect(result).toHaveProperty("sampleSize");
    expect(result).toHaveProperty("computedAt");
    expect(result.signals).toBeInstanceOf(Array);
    expect(result.positiveSignals).toBeInstanceOf(Array);
  });

  it("handles empty reviews gracefully", () => {
    const data = makeProductData({ reviews: [], totalRatings: 0, histogram: null });
    const result = computeTrustScore(data);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("confidence weighting reduces impact of low-confidence signals", () => {
    // Same data but with very few reviews (low confidence)
    const fewReviews = makeProductData({
      reviews: [
        makeReview({ verified: false, helpfulVotes: 0, rating: 5, text: "Great product!" }),
        makeReview({ verified: false, helpfulVotes: 0, rating: 5, text: "Love it!" }),
        makeReview({ verified: false, helpfulVotes: 0, rating: 5, text: "Amazing!" }),
      ],
      totalRatings: 10,
    });

    const manyReviews = makeProductData({
      reviews: Array.from({ length: 10 }, () =>
        makeReview({ verified: false, helpfulVotes: 0, rating: 5, text: "Great product! Love it! Highly recommend!" })
      ),
      totalRatings: 500,
    });

    const fewResult = computeTrustScore(fewReviews);
    const manyResult = computeTrustScore(manyReviews);

    // With more data (higher confidence), the same bad signals should produce a lower score
    expect(manyResult.score).toBeLessThanOrEqual(fewResult.score);
  });
});
