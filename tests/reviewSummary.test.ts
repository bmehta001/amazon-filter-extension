/**
 * Tests for review summary engine.
 */
import { describe, it, expect } from "vitest";
import { generateReviewSummary } from "../src/review/summary";
import type { ReviewData } from "../src/review/types";

function makeReview(text: string, rating: number): ReviewData {
  return {
    text,
    rating,
    date: new Date("2024-01-15"),
    verified: true,
    helpfulVotes: 5,
  };
}

describe("generateReviewSummary", () => {
  it("returns null for fewer than 2 reviews", () => {
    const result = generateReviewSummary([makeReview("Great sound quality", 5)]);
    expect(result).toBeNull();
  });

  it("returns null when no aspects are detected", () => {
    const reviews = [
      makeReview("ok", 3),
      makeReview("meh", 3),
    ];
    expect(generateReviewSummary(reviews)).toBeNull();
  });

  it("extracts positive aspects from high-rated reviews", () => {
    const reviews = [
      makeReview("The sound quality is amazing, crystal clear audio", 5),
      makeReview("Great sound and the battery life lasts forever", 5),
      makeReview("Excellent audio output and comfortable to wear", 4),
    ];
    const result = generateReviewSummary(reviews)!;
    expect(result).not.toBeNull();
    expect(result.pros.length).toBeGreaterThan(0);
    expect(result.pros[0].sentiment).toBe("positive");
    expect(result.pros[0].avgRating).toBeGreaterThanOrEqual(4);
  });

  it("extracts negative aspects from low-rated reviews", () => {
    const reviews = [
      makeReview("Battery life is terrible, barely lasts 2 hours", 1),
      makeReview("The battery dies so fast, very disappointing", 2),
      makeReview("Sound is great though", 4),
    ];
    const result = generateReviewSummary(reviews)!;
    expect(result).not.toBeNull();
    expect(result.cons.length).toBeGreaterThan(0);
    const batteryAspect = result.cons.find((c) => c.label === "battery life");
    expect(batteryAspect).toBeDefined();
    expect(batteryAspect!.sentiment).toBe("negative");
  });

  it("sorts aspects by mention count descending", () => {
    const reviews = [
      makeReview("Sound quality is great, love the audio", 5),
      makeReview("Amazing sound quality and clarity", 5),
      makeReview("Sound is wonderful", 5),
      makeReview("Battery is decent", 4),
    ];
    const result = generateReviewSummary(reviews)!;
    expect(result.pros[0].label).toBe("sound quality");
    expect(result.pros[0].mentions).toBe(3);
  });

  it("limits pros to 3 and cons to 2", () => {
    const reviews = [
      makeReview("Great sound quality, comfortable, good value, nice design, easy to use, durable", 5),
      makeReview("Excellent audio, fits well, affordable, looks great, simple setup, long lasting", 5),
      makeReview("Terrible battery, poor connectivity", 1),
      makeReview("Battery dies fast, wifi keeps disconnecting", 1),
    ];
    const result = generateReviewSummary(reviews)!;
    expect(result.pros.length).toBeLessThanOrEqual(3);
    expect(result.cons.length).toBeLessThanOrEqual(2);
  });

  it("generates a one-liner with pros and cons", () => {
    const reviews = [
      makeReview("The sound quality is exceptional", 5),
      makeReview("Great audio experience", 5),
      makeReview("Battery life is disappointing", 2),
      makeReview("Battery drains too quickly", 1),
    ];
    const result = generateReviewSummary(reviews)!;
    expect(result.oneLiner).toContain("👍");
    expect(result.oneLiner).toContain("sound quality");
  });

  it("generates one-liner with only pros when no cons", () => {
    const reviews = [
      makeReview("Sound quality is amazing", 5),
      makeReview("Great audio clarity", 5),
    ];
    const result = generateReviewSummary(reviews)!;
    expect(result.oneLiner).toContain("👍");
    expect(result.oneLiner).not.toContain("👎");
  });

  it("handles mixed product types (food/taste)", () => {
    const reviews = [
      makeReview("Delicious taste, my kids love the flavor", 5),
      makeReview("Great flavor and fresh ingredients", 5),
      makeReview("Arrived damaged in shipping", 1),
      makeReview("Packaging was terrible, damaged delivery", 2),
    ];
    const result = generateReviewSummary(reviews)!;
    const tastePro = result.pros.find((p) => p.label === "taste");
    expect(tastePro).toBeDefined();
    const deliveryCon = result.cons.find((c) => c.label === "delivery");
    expect(deliveryCon).toBeDefined();
  });

  it("skips reviews with very short text", () => {
    const reviews = [
      makeReview("ok", 3),
      makeReview("Sound quality is incredible, best headphones ever", 5),
      makeReview("good", 4),
      makeReview("Amazing audio and bass response", 5),
    ];
    const result = generateReviewSummary(reviews)!;
    // "ok" and "good" are <10 chars so should be skipped
    expect(result.pros[0].mentions).toBe(2); // only the 2 longer reviews
  });

  it("correctly computes average rating per aspect", () => {
    const reviews = [
      makeReview("The battery life is great", 5),
      makeReview("Battery lasts all day", 4),
      makeReview("Battery is okay", 3),
    ];
    const result = generateReviewSummary(reviews)!;
    const battery = result.pros.find((p) => p.label === "battery life")
      ?? result.cons.find((c) => c.label === "battery life");
    expect(battery).toBeDefined();
    expect(battery!.avgRating).toBe(4); // (5+4+3)/3 = 4
    expect(battery!.mentions).toBe(3);
  });

  it("handles connectivity aspects", () => {
    const reviews = [
      makeReview("Bluetooth pairing is seamless", 5),
      makeReview("Great wireless connection, never disconnects", 5),
    ];
    const result = generateReviewSummary(reviews)!;
    const conn = result.pros.find((p) => p.label === "connectivity");
    expect(conn).toBeDefined();
    expect(conn!.sentiment).toBe("positive");
  });
});
