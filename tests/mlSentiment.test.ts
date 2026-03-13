import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductReviewData } from "../src/review/types";

// Mock the transformers library before any imports that use it
const mockClassifier = vi.fn();
vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(async () => mockClassifier),
}));

// -------------------------------------------------------------------------
// mlSentiment module tests
// -------------------------------------------------------------------------

describe("mlSentiment", () => {
  beforeEach(() => {
    vi.resetModules();
    mockClassifier.mockReset();
  });

  describe("loadModel", () => {
    it("returns true on successful load", async () => {
      const { loadModel, isModelLoaded } = await import(
        "../src/review/mlSentiment"
      );
      const result = await loadModel();
      expect(result).toBe(true);
      expect(isModelLoaded()).toBe(true);
    });

    it("returns false when pipeline throws", async () => {
      const transformers = await import("@huggingface/transformers");
      vi.mocked(transformers.pipeline).mockRejectedValueOnce(
        new Error("load error"),
      );

      const { loadModel, isModelLoaded } = await import(
        "../src/review/mlSentiment"
      );
      const result = await loadModel();
      expect(result).toBe(false);
      expect(isModelLoaded()).toBe(false);
    });
  });

  describe("analyzeSentiment", () => {
    it("returns sentiment result when model is loaded", async () => {
      mockClassifier.mockResolvedValueOnce([
        { label: "POSITIVE", score: 0.95 },
      ]);

      const { loadModel, analyzeSentiment } = await import(
        "../src/review/mlSentiment"
      );
      await loadModel();

      const result = await analyzeSentiment("This product is great!");
      expect(result).toEqual({ label: "POSITIVE", score: 0.95 });
    });

    it("returns null when model is not loaded", async () => {
      const { analyzeSentiment } = await import("../src/review/mlSentiment");

      const result = await analyzeSentiment("This product is great!");
      expect(result).toBeNull();
    });
  });

  describe("detectSentimentMismatch", () => {
    it("deducts 15 for high rating with negative sentiment", async () => {
      mockClassifier.mockResolvedValueOnce([
        { label: "NEGATIVE", score: 0.85 },
      ]);

      const { loadModel, detectSentimentMismatch } = await import(
        "../src/review/mlSentiment"
      );
      await loadModel();

      const result = await detectSentimentMismatch("Terrible product", 5);
      expect(result.deduction).toBe(15);
      expect(result.reason).toBe(
        "Positive rating contradicts negative sentiment",
      );
    });

    it("deducts 10 for low rating with positive sentiment", async () => {
      mockClassifier.mockResolvedValueOnce([
        { label: "POSITIVE", score: 0.9 },
      ]);

      const { loadModel, detectSentimentMismatch } = await import(
        "../src/review/mlSentiment"
      );
      await loadModel();

      const result = await detectSentimentMismatch("Amazing product!", 1);
      expect(result.deduction).toBe(10);
      expect(result.reason).toBe(
        "Negative rating contradicts positive sentiment",
      );
    });

    it("deducts 0 when sentiment matches rating", async () => {
      mockClassifier.mockResolvedValueOnce([
        { label: "POSITIVE", score: 0.95 },
      ]);

      const { loadModel, detectSentimentMismatch } = await import(
        "../src/review/mlSentiment"
      );
      await loadModel();

      const result = await detectSentimentMismatch("Love this product!", 5);
      expect(result.deduction).toBe(0);
      expect(result.reason).toBeNull();
    });

    it("deducts 0 when model is not loaded", async () => {
      const { detectSentimentMismatch } = await import(
        "../src/review/mlSentiment"
      );

      const result = await detectSentimentMismatch("Some text", 5);
      expect(result.deduction).toBe(0);
      expect(result.reason).toBeNull();
    });
  });
});

// -------------------------------------------------------------------------
// computeReviewScoreWithML tests
// -------------------------------------------------------------------------

describe("computeReviewScoreWithML", () => {
  const baseData: ProductReviewData = {
    asin: "B000TEST01",
    histogram: { five: 50, four: 20, three: 15, two: 10, one: 5 },
    totalRatings: 100,
    averageRating: 4.0,
    reviews: [
      {
        text: "Solid product, works well for me.",
        rating: 4,
        date: new Date("2024-01-10"),
        verified: true,
        helpfulVotes: 3,
      },
    ],
  };

  beforeEach(() => {
    vi.resetModules();
    mockClassifier.mockReset();
  });

  it("returns same score as heuristic when ML model is not loaded", async () => {
    const { computeReviewScore, computeReviewScoreWithML } = await import(
      "../src/review/analyzer"
    );

    const heuristicScore = computeReviewScore(baseData);
    const mlScore = await computeReviewScoreWithML(baseData);

    expect(mlScore.score).toBe(heuristicScore.score);
    expect(mlScore.label).toBe(heuristicScore.label);
  });

  it("is callable and returns a valid ReviewScore", async () => {
    const { computeReviewScoreWithML } = await import(
      "../src/review/analyzer"
    );

    const result = await computeReviewScoreWithML(baseData);
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("label");
    expect(result).toHaveProperty("breakdown");
    expect(result).toHaveProperty("computedAt");
    expect(typeof result.score).toBe("number");
    expect(["authentic", "mixed", "suspicious"]).toContain(result.label);
  });
});
