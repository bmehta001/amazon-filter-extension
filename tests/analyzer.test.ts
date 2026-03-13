import { describe, it, expect } from "vitest";
import {
  analyzeHistogram,
  analyzeReviewText,
  analyzeReviewTexts,
  analyzeTemporalPattern,
  computeReviewScore,
} from "../src/review/analyzer";
import type {
  HistogramData,
  ReviewData,
  ProductReviewData,
} from "../src/review/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReview(overrides: Partial<ReviewData> = {}): ReviewData {
  return {
    text: "This is a normal review with enough words to avoid being flagged as short.",
    rating: 4,
    date: new Date("2024-01-15"),
    verified: true,
    helpfulVotes: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. analyzeHistogram
// ---------------------------------------------------------------------------

describe("analyzeHistogram", () => {
  it("returns no deduction for a normal distribution", () => {
    const histogram: HistogramData = {
      five: 30,
      four: 25,
      three: 20,
      two: 15,
      one: 10,
    };
    const result = analyzeHistogram(histogram, 100);
    expect(result.deduction).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it("detects J-curve distribution", () => {
    // twoPct + threePct must be strictly < 10 to trigger
    const histogram: HistogramData = {
      five: 72,
      four: 5,
      three: 4,
      two: 3,
      one: 16,
    };
    const result = analyzeHistogram(histogram, 100);
    expect(result.deduction).toBeGreaterThan(0);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/J-curve/i),
      ]),
    );
  });

  it("detects suspiciously high 5-star percentage", () => {
    const histogram: HistogramData = {
      five: 95,
      four: 2,
      three: 1,
      two: 1,
      one: 1,
    };
    const result = analyzeHistogram(histogram, 100);
    expect(result.deduction).toBeGreaterThan(0);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/5-star/i),
      ]),
    );
  });

  it("detects low rating diversity (all 5-star)", () => {
    const histogram: HistogramData = {
      five: 100,
      four: 0,
      three: 0,
      two: 0,
      one: 0,
    };
    const result = analyzeHistogram(histogram, 100);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/diversity/i),
      ]),
    );
  });

  it("returns no deduction for an empty histogram", () => {
    const histogram: HistogramData = {
      five: 0,
      four: 0,
      three: 0,
      two: 0,
      one: 0,
    };
    const result = analyzeHistogram(histogram, 0);
    expect(result.deduction).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it("caps total deduction at 30", () => {
    // Triggers J-curve (25) + high 5-star (20) + low diversity (15) = 60 → capped at 30
    const histogram: HistogramData = {
      five: 95,
      four: 0,
      three: 0,
      two: 0,
      one: 5,
    };
    const result = analyzeHistogram(histogram, 100);
    expect(result.deduction).toBeLessThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// 2. analyzeReviewText
// ---------------------------------------------------------------------------

describe("analyzeReviewText", () => {
  it("returns low deduction for an authentic review", () => {
    const review = makeReview({
      text: "I purchased this wireless keyboard last month and have been using it daily for work. The key travel is comfortable, battery life exceeds expectations, and the Bluetooth pairing was seamless with my laptop. Build quality feels premium despite the affordable price point. My only minor complaint is the lack of backlighting, which makes it harder to use in dim environments. Overall a solid peripheral that delivers great value for everyday productivity tasks.",
      rating: 4,
    });
    const result = analyzeReviewText(review);
    expect(result.deduction).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it("flags repetitive vocabulary (low TTR)", () => {
    // Repeat a small set of words many times to push TTR below 0.35
    const repetitive =
      "good product good product good product good product good product good product good product good product good product good product good product good product good product good product good product good product";
    const review = makeReview({ text: repetitive, rating: 4 });
    const result = analyzeReviewText(review);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/type-token ratio/i),
      ]),
    );
  });

  it("flags high superlative density", () => {
    const review = makeReview({
      text: "Amazing perfect best excellent incredible wonderful fantastic outstanding awesome love great",
      rating: 5,
    });
    const result = analyzeReviewText(review);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/superlative/i),
      ]),
    );
  });

  it("flags multiple template phrases", () => {
    const review = makeReview({
      text: "I received this item last week. It is a great product and works as expected. I highly recommend it to everyone. It is totally worth the money and I love this thing so much.",
      rating: 5,
    });
    const result = analyzeReviewText(review);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/template/i),
      ]),
    );
  });

  it("flags a very short 5-star review", () => {
    const review = makeReview({
      text: "Great product love it",
      rating: 5,
    });
    const result = analyzeReviewText(review);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/short 5-star/i),
      ]),
    );
  });

  it("caps total deduction at 40", () => {
    // Trigger all flags simultaneously
    const review = makeReview({
      text: "love love love love love love love love love love love love love love love love love love love love love love love love love love love love love love love love love love love love love I received this great product. Highly recommend it. Worth the money. Love this!",
      rating: 5,
    });
    const result = analyzeReviewText(review);
    expect(result.deduction).toBeLessThanOrEqual(40);
  });
});

// ---------------------------------------------------------------------------
// 3. analyzeReviewTexts (aggregate)
// ---------------------------------------------------------------------------

describe("analyzeReviewTexts", () => {
  it("returns zero for empty review array", () => {
    const result = analyzeReviewTexts([]);
    expect(result.avgDeduction).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it("averages deductions and de-duplicates reasons", () => {
    const reviews = [
      makeReview({ text: "Great product love it", rating: 5 }),
      makeReview({
        text: "I purchased this wireless keyboard and have been using it daily for work. The key travel is comfortable, battery life exceeds expectations, and the Bluetooth pairing was seamless.",
        rating: 4,
      }),
    ];
    const result = analyzeReviewTexts(reviews);
    // First review gets a deduction, second does not → average is halved
    expect(result.avgDeduction).toBeGreaterThan(0);
    expect(result.avgDeduction).toBeLessThan(40);
  });
});

// ---------------------------------------------------------------------------
// 4. analyzeTemporalPattern
// ---------------------------------------------------------------------------

describe("analyzeTemporalPattern", () => {
  it("returns no deduction for reviews spread over months", () => {
    const reviews = [
      makeReview({ date: new Date("2024-01-15") }),
      makeReview({ date: new Date("2024-03-20") }),
      makeReview({ date: new Date("2024-06-10") }),
      makeReview({ date: new Date("2024-09-05") }),
      makeReview({ date: new Date("2024-11-25") }),
    ];
    const result = analyzeTemporalPattern(reviews);
    expect(result.deduction).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it("detects burst of 5+ reviews within 24 hours", () => {
    const base = new Date("2024-06-01T10:00:00Z");
    const reviews = Array.from({ length: 6 }, (_, i) =>
      makeReview({ date: new Date(base.getTime() + i * 3_600_000) }),
    );
    const result = analyzeTemporalPattern(reviews);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/burst.*5\+.*24 hours/i),
      ]),
    );
  });

  it("detects recovery burst after negative review", () => {
    const reviews = [
      makeReview({ date: new Date("2024-04-01T08:00:00Z"), rating: 1 }),
      makeReview({ date: new Date("2024-04-01T20:00:00Z"), rating: 5 }),
      makeReview({ date: new Date("2024-04-02T06:00:00Z"), rating: 5 }),
      makeReview({ date: new Date("2024-04-02T14:00:00Z"), rating: 5 }),
    ];
    const result = analyzeTemporalPattern(reviews);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/recovery burst/i),
      ]),
    );
  });

  it("flags all reviews posted within a single week", () => {
    const reviews = [
      makeReview({ date: new Date("2024-05-01") }),
      makeReview({ date: new Date("2024-05-03") }),
      makeReview({ date: new Date("2024-05-06") }),
    ];
    const result = analyzeTemporalPattern(reviews);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/single week/i),
      ]),
    );
  });

  it("returns no deduction for fewer than 2 reviews", () => {
    const result = analyzeTemporalPattern([makeReview()]);
    expect(result.deduction).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it("caps total deduction at 30", () => {
    // Trigger burst (15) + recovery (20) + same week (10) = 45 → capped at 30
    const reviews = [
      makeReview({ date: new Date("2024-07-01T00:00:00Z"), rating: 1 }),
      makeReview({ date: new Date("2024-07-01T01:00:00Z"), rating: 5 }),
      makeReview({ date: new Date("2024-07-01T02:00:00Z"), rating: 5 }),
      makeReview({ date: new Date("2024-07-01T03:00:00Z"), rating: 5 }),
      makeReview({ date: new Date("2024-07-01T04:00:00Z"), rating: 5 }),
      makeReview({ date: new Date("2024-07-01T05:00:00Z"), rating: 5 }),
    ];
    const result = analyzeTemporalPattern(reviews);
    expect(result.deduction).toBeLessThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// 5. computeReviewScore
// ---------------------------------------------------------------------------

describe("computeReviewScore", () => {
  it('scores an authentic product as "authentic" (>= 80)', () => {
    const data: ProductReviewData = {
      asin: "B000AUTHENTIC",
      histogram: { five: 30, four: 25, three: 20, two: 15, one: 10 },
      totalRatings: 200,
      averageRating: 3.8,
      reviews: [
        makeReview({ date: new Date("2024-01-10"), rating: 4, text: "Solid build quality. The keyboard works well with my desktop setup and the keys have a satisfying click to them. Packaging was clean and delivery was prompt." }),
        makeReview({ date: new Date("2024-04-22"), rating: 3, text: "Decent product for the price but the Bluetooth range could be better. Occasionally drops connection when I move more than two meters away from the dongle." }),
        makeReview({ date: new Date("2024-07-18"), rating: 5, text: "Upgraded from a membrane keyboard and the difference is night and day. Typing speed improved and wrist fatigue dropped noticeably after the first week of use." }),
        makeReview({ date: new Date("2024-10-03"), rating: 4, text: "Battery lasted about three months of daily use before needing a recharge. The USB-C charging port is convenient but the cable is too short." }),
      ],
    };
    const result = computeReviewScore(data);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.label).toBe("authentic");
  });

  it('scores a suspicious product as "suspicious" (< 50)', () => {
    const base = new Date("2024-06-01T10:00:00Z");
    const templateText =
      "I received this great product. Highly recommend it. Worth the money. Love this! 5 stars all the way. Amazing perfect best excellent incredible wonderful fantastic outstanding awesome love great thing ever made.";

    const data: ProductReviewData = {
      asin: "B000SUSPECT",
      histogram: { five: 95, four: 0, three: 0, two: 0, one: 5 },
      totalRatings: 100,
      averageRating: 4.9,
      reviews: Array.from({ length: 6 }, (_, i) =>
        makeReview({
          date: new Date(base.getTime() + i * 3_600_000),
          rating: 5,
          text: templateText,
        }),
      ),
    };
    const result = computeReviewScore(data);
    expect(result.score).toBeLessThan(50);
    expect(result.label).toBe("suspicious");
  });

  it('scores a mixed-signals product as "mixed" (50-79)', () => {
    // J-curve histogram (-25) + reviews within one week (-10) + short 5-star avg (-1.67)
    const data: ProductReviewData = {
      asin: "B000MIXED",
      histogram: { five: 75, four: 3, three: 3, two: 3, one: 16 },
      totalRatings: 80,
      averageRating: 3.7,
      reviews: [
        makeReview({ date: new Date("2024-05-01"), rating: 4, text: "Works fine for what it is. Nothing spectacular but gets the job done around the house." }),
        makeReview({ date: new Date("2024-05-03"), rating: 5, text: "Great product love it" }),
        makeReview({ date: new Date("2024-05-05"), rating: 2, text: "Broke after one month, very disappointed with the overall build quality of this item." }),
      ],
    };
    const result = computeReviewScore(data);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThan(80);
    expect(result.label).toBe("mixed");
  });

  it("returns score 100 when no histogram and no reviews", () => {
    const data: ProductReviewData = {
      asin: "B000EMPTY",
      histogram: null,
      reviews: [],
      totalRatings: 0,
      averageRating: 0,
    };
    const result = computeReviewScore(data);
    expect(result.score).toBe(100);
    expect(result.label).toBe("authentic");
    expect(result.breakdown.histogramDeduction).toBe(0);
    expect(result.breakdown.textDeduction).toBe(0);
    expect(result.breakdown.temporalDeduction).toBe(0);
  });
});
