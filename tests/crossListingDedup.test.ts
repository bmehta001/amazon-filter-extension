import { describe, it, expect } from "vitest";
import {
  tokenizeTitle,
  jaccardSimilarity,
  detectCrossListingDuplicates,
  duplicateLabel,
  DEFAULT_SIMILARITY_THRESHOLD,
} from "../src/content/crossListingDedup";
import type { Product } from "../src/types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    element: document.createElement("div"),
    title: "Wireless Bluetooth Headphones Noise Cancelling Over Ear",
    reviewCount: 500,
    rating: 4.3,
    price: 49.99,
    brand: "SoundMax",
    isSponsored: false,
    asin: "B001",
    ...overrides,
  };
}

describe("tokenizeTitle", () => {
  it("lowercases and splits into tokens", () => {
    const tokens = tokenizeTitle("Wireless Bluetooth Headphones");
    expect(tokens.has("wireless")).toBe(true);
    expect(tokens.has("bluetooth")).toBe(true);
    expect(tokens.has("headphones")).toBe(true);
  });

  it("removes stop words", () => {
    const tokens = tokenizeTitle("The Best Premium Headphones for You");
    expect(tokens.has("the")).toBe(false);
    expect(tokens.has("best")).toBe(false);
    expect(tokens.has("premium")).toBe(false);
    expect(tokens.has("for")).toBe(false);
    expect(tokens.has("headphones")).toBe(true);
  });

  it("removes punctuation", () => {
    const tokens = tokenizeTitle("Sony WH-1000XM5 (Black)");
    expect(tokens.has("sony")).toBe(true);
    expect(tokens.has("wh")).toBe(true);
    expect(tokens.has("1000xm5")).toBe(true);
    expect(tokens.has("black")).toBe(true);
  });

  it("filters single-character tokens", () => {
    const tokens = tokenizeTitle("a b cd efg");
    expect(tokens.has("a")).toBe(false);
    expect(tokens.has("b")).toBe(false);
    expect(tokens.has("cd")).toBe(true);
    expect(tokens.has("efg")).toBe(true);
  });

  it("returns a Set (deduplicates)", () => {
    const tokens = tokenizeTitle("headphones headphones wireless");
    expect(tokens.size).toBe(2);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    const a = new Set(["wireless", "bluetooth", "headphones"]);
    expect(jaccardSimilarity(a, a)).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    const a = new Set(["apple", "orange"]);
    const b = new Set(["car", "bus"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns correct value for overlapping sets", () => {
    const a = new Set(["wireless", "bluetooth", "headphones"]);
    const b = new Set(["wireless", "bluetooth", "earbuds"]);
    // intersection: 2, union: 4
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5);
  });

  it("returns 0 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("returns 0 when one set is empty", () => {
    expect(jaccardSimilarity(new Set(["a"]), new Set())).toBe(0);
  });
});

describe("detectCrossListingDuplicates", () => {
  it("detects similar products from the same brand", () => {
    const products = [
      makeProduct({
        asin: "B001",
        title: "SoundMax Wireless Bluetooth Headphones Noise Cancelling Over Ear",
        brand: "SoundMax",
        reviewCount: 1000,
      }),
      makeProduct({
        asin: "B002",
        title: "SoundMax Wireless Bluetooth Noise Cancelling Headphones",
        brand: "SoundMax",
        reviewCount: 200,
      }),
    ];
    const result = detectCrossListingDuplicates(products);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].bestIndex).toBe(0); // more reviews
    expect(result.groups[0].memberIndices).toContain(0);
    expect(result.groups[0].memberIndices).toContain(1);
    expect(result.groups[0].similarity).toBeGreaterThan(0.5);
  });

  it("does NOT group products from different brands", () => {
    const products = [
      makeProduct({
        asin: "B001",
        title: "Wireless Bluetooth Headphones Noise Cancelling",
        brand: "BrandA",
      }),
      makeProduct({
        asin: "B002",
        title: "Wireless Bluetooth Headphones Noise Cancelling",
        brand: "BrandB",
      }),
    ];
    const result = detectCrossListingDuplicates(products);
    expect(result.groups).toHaveLength(0);
  });

  it("does NOT group products with low similarity", () => {
    const products = [
      makeProduct({
        asin: "B001",
        title: "SoundMax Wireless Bluetooth Headphones",
        brand: "SoundMax",
      }),
      makeProduct({
        asin: "B002",
        title: "SoundMax Portable Bluetooth Speaker Waterproof",
        brand: "SoundMax",
      }),
    ];
    const result = detectCrossListingDuplicates(products);
    expect(result.groups).toHaveLength(0);
  });

  it("picks best product by reviews → rating → price", () => {
    const products = [
      makeProduct({
        asin: "B001",
        title: "SoundMax Wireless Headphones Bluetooth Noise Cancelling",
        brand: "SoundMax",
        reviewCount: 100,
        rating: 4.5,
        price: 59.99,
      }),
      makeProduct({
        asin: "B002",
        title: "SoundMax Wireless Bluetooth Headphones Noise Cancelling Over Ear",
        brand: "SoundMax",
        reviewCount: 100,
        rating: 4.5,
        price: 39.99,
      }),
    ];
    const result = detectCrossListingDuplicates(products);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].bestIndex).toBe(1); // lower price wins tie
  });

  it("handles single product gracefully", () => {
    const result = detectCrossListingDuplicates([makeProduct()]);
    expect(result.groups).toHaveLength(0);
    expect(result.indexToGroup.size).toBe(0);
  });

  it("handles empty array", () => {
    const result = detectCrossListingDuplicates([]);
    expect(result.groups).toHaveLength(0);
  });

  it("skips products with very short titles", () => {
    const products = [
      makeProduct({ asin: "B001", title: "AB", brand: "X" }),
      makeProduct({ asin: "B002", title: "AB", brand: "X" }),
    ];
    const result = detectCrossListingDuplicates(products);
    expect(result.groups).toHaveLength(0);
  });

  it("skips products with same ASIN", () => {
    const products = [
      makeProduct({
        asin: "B001",
        title: "SoundMax Wireless Bluetooth Headphones Noise Cancelling",
        brand: "SoundMax",
      }),
      makeProduct({
        asin: "B001",
        title: "SoundMax Wireless Bluetooth Headphones Noise Cancelling Over Ear",
        brand: "SoundMax",
      }),
    ];
    const result = detectCrossListingDuplicates(products);
    expect(result.groups).toHaveLength(0);
  });

  it("groups 3 similar products together via union-find", () => {
    const products = [
      makeProduct({
        asin: "B001",
        title: "SoundMax Wireless Bluetooth Headphones Noise Cancelling",
        brand: "SoundMax",
        reviewCount: 1000,
      }),
      makeProduct({
        asin: "B002",
        title: "SoundMax Wireless Bluetooth Noise Cancelling Headphones",
        brand: "SoundMax",
        reviewCount: 500,
      }),
      makeProduct({
        asin: "B003",
        title: "SoundMax Bluetooth Wireless Headphones Cancelling Noise",
        brand: "SoundMax",
        reviewCount: 200,
      }),
    ];
    const result = detectCrossListingDuplicates(products);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].memberIndices).toHaveLength(3);
    expect(result.groups[0].bestIndex).toBe(0); // most reviews
  });

  it("provides indexToGroup for quick lookup", () => {
    const products = [
      makeProduct({
        asin: "B001",
        title: "SoundMax Wireless Bluetooth Headphones Noise Cancelling",
        brand: "SoundMax",
      }),
      makeProduct({
        asin: "B002",
        title: "SoundMax Wireless Bluetooth Noise Cancelling Headphones",
        brand: "SoundMax",
      }),
      makeProduct({
        asin: "B003",
        title: "TotallyDifferent Product Unrelated Item",
        brand: "Other",
      }),
    ];
    const result = detectCrossListingDuplicates(products);
    expect(result.indexToGroup.has(0)).toBe(true);
    expect(result.indexToGroup.has(1)).toBe(true);
    expect(result.indexToGroup.has(2)).toBe(false);
    expect(result.indexToGroup.get(0)).toBe(result.indexToGroup.get(1));
  });

  it("respects custom threshold", () => {
    const products = [
      makeProduct({
        asin: "B001",
        title: "SoundMax Wireless Headphones Bluetooth Ear Over",
        brand: "SoundMax",
      }),
      makeProduct({
        asin: "B002",
        title: "SoundMax Wireless Headphones Bluetooth Version Two Updated Model",
        brand: "SoundMax",
      }),
    ];
    // With very high threshold, should not match
    const strictResult = detectCrossListingDuplicates(products, 0.95);
    expect(strictResult.groups).toHaveLength(0);

    // With low threshold, should match
    const lenientResult = detectCrossListingDuplicates(products, 0.3);
    expect(lenientResult.groups).toHaveLength(1);
  });
});

describe("duplicateLabel", () => {
  it("generates best-product label", () => {
    const products = [
      makeProduct({ asin: "B001", title: "Product A" }),
      makeProduct({ asin: "B002", title: "Product B" }),
    ];
    const group = { bestIndex: 0, memberIndices: [0, 1], similarity: 0.75 };
    const label = duplicateLabel(group, 0, products);
    expect(label).toContain("Best of 2");
    expect(label).toContain("75%");
  });

  it("generates duplicate-product label with reference", () => {
    const products = [
      makeProduct({ asin: "B001", title: "Best Wireless Headphones" }),
      makeProduct({ asin: "B002", title: "Similar Wireless Headphones" }),
    ];
    const group = { bestIndex: 0, memberIndices: [0, 1], similarity: 0.65 };
    const label = duplicateLabel(group, 1, products);
    expect(label).toContain("Similar to");
    expect(label).toContain("Best Wireless Headphones");
    expect(label).toContain("65%");
  });

  it("truncates long titles", () => {
    const longTitle = "A".repeat(80);
    const products = [
      makeProduct({ asin: "B001", title: longTitle }),
      makeProduct({ asin: "B002", title: "Other" }),
    ];
    const group = { bestIndex: 0, memberIndices: [0, 1], similarity: 0.7 };
    const label = duplicateLabel(group, 1, products);
    expect(label).toContain("…");
    expect(label.length).toBeLessThan(longTitle.length);
  });
});

describe("DEFAULT_SIMILARITY_THRESHOLD", () => {
  it("is a reasonable value between 0 and 1", () => {
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBeGreaterThan(0.3);
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBeLessThan(0.9);
  });
});
