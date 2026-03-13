import { describe, it, expect } from "vitest";
import { parseCount, parseRating, parsePrice, extractAsin } from "../src/util/parse";

describe("parseCount", () => {
  it("parses simple numbers", () => {
    expect(parseCount("1234")).toBe(1234);
  });

  it("parses comma-separated numbers", () => {
    expect(parseCount("1,234")).toBe(1234);
    expect(parseCount("12,345")).toBe(12345);
  });

  it("parses K abbreviations", () => {
    expect(parseCount("1.2K")).toBe(1200);
    expect(parseCount("1.2k")).toBe(1200);
    expect(parseCount("50K")).toBe(50000);
    expect(parseCount("2.5K")).toBe(2500);
  });

  it("parses M and B abbreviations", () => {
    expect(parseCount("1.5M")).toBe(1500000);
    expect(parseCount("2m")).toBe(2000000);
    expect(parseCount("1.2B")).toBe(1200000000);
  });

  it("returns 0 for empty/invalid input", () => {
    expect(parseCount("")).toBe(0);
    expect(parseCount("abc")).toBe(0);
  });
});

describe("parseRating", () => {
  it("parses 'X out of 5 stars' format", () => {
    expect(parseRating("4.5 out of 5 stars")).toBe(4.5);
  });

  it("parses 'X/5' format", () => {
    expect(parseRating("4.5/5")).toBe(4.5);
  });

  it("parses bare number", () => {
    expect(parseRating("3.7")).toBe(3.7);
  });

  it("returns 0 for empty/invalid input", () => {
    expect(parseRating("")).toBe(0);
    expect(parseRating("no rating")).toBe(0);
  });
});

describe("parsePrice", () => {
  it("parses US dollar format", () => {
    expect(parsePrice("$29.99")).toBe(29.99);
    expect(parsePrice("$1,234.56")).toBe(1234.56);
  });

  it("parses European format", () => {
    expect(parsePrice("29,99 €")).toBe(29.99);
    expect(parsePrice("1.234,56 €")).toBe(1234.56);
  });

  it("parses other currencies", () => {
    expect(parsePrice("₹1,499.00")).toBe(1499.0);
    expect(parsePrice("£29.99")).toBe(29.99);
  });

  it("returns null for empty/invalid input", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("free")).toBeNull();
  });
});

describe("extractAsin", () => {
  it("extracts from /dp/ URLs", () => {
    expect(extractAsin("/dp/B08N5WRWNW")).toBe("B08N5WRWNW");
    expect(
      extractAsin("https://www.amazon.com/dp/B08N5WRWNW/ref=sr_1_1"),
    ).toBe("B08N5WRWNW");
  });

  it("extracts from /gp/product/ URLs", () => {
    expect(
      extractAsin("https://www.amazon.com/gp/product/B08N5WRWNW"),
    ).toBe("B08N5WRWNW");
  });

  it("extracts bare ASIN", () => {
    expect(extractAsin("B08N5WRWNW")).toBe("B08N5WRWNW");
  });

  it("returns null for invalid input", () => {
    expect(extractAsin("")).toBeNull();
    expect(extractAsin("not-an-asin")).toBeNull();
  });
});
