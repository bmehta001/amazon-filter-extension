import { describe, it, expect } from "vitest";
import { normalizeTitle, findDuplicates, DEDUP_CATEGORIES } from "../src/content/dedup";
import type { Product } from "../src/types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    element: document.createElement("div"),
    title: "Test Product Title",
    reviewCount: 100,
    rating: 4.0,
    price: 29.99,
    brand: "TestBrand",
    isSponsored: false,
    asin: "B08N5WRWNW",
    ...overrides,
  };
}

describe("normalizeTitle", () => {
  it("strips color words when color category is selected", () => {
    const result = normalizeTitle("USB Cable Black 6ft", ["color"]);
    expect(result).not.toContain("black");
    expect(result).toContain("usb");
    expect(result).toContain("cable");
  });

  it("strips multi-word color names", () => {
    const result = normalizeTitle("Phone Case Matte Black Edition", ["color"]);
    expect(result).not.toContain("matte");
    expect(result).not.toContain("black");
  });

  it("strips size/length words when size category is selected", () => {
    const result = normalizeTitle("HDMI Cable 6 ft High Speed", ["size"]);
    expect(result).not.toMatch(/6\s*ft/);
    expect(result).toContain("hdmi");
    expect(result).toContain("cable");
  });

  it("strips clothing sizes", () => {
    const result = normalizeTitle("Cotton T-Shirt Large Blue", ["size"]);
    expect(result).not.toContain("large");
    expect(result).toContain("cotton");
  });

  it("strips count/quantity words when count category is selected", () => {
    const result = normalizeTitle("AA Batteries 24 Pack", ["count"]);
    expect(result).not.toMatch(/24\s*pack/);
    expect(result).toContain("aa");
    expect(result).toContain("batteries");
  });

  it("strips style words when style category is selected", () => {
    const result = normalizeTitle("Desk Lamp Modern LED", ["style"]);
    expect(result).not.toContain("modern");
    expect(result).toContain("desk");
    expect(result).toContain("lamp");
  });

  it("strips multiple categories at once", () => {
    const result = normalizeTitle(
      "USB Cable Black 10ft 2 Pack Premium",
      ["color", "size", "count", "style"],
    );
    expect(result).not.toContain("black");
    expect(result).not.toMatch(/10\s*ft/);
    expect(result).not.toMatch(/2\s*pack/);
    expect(result).not.toContain("premium");
    expect(result).toContain("usb");
    expect(result).toContain("cable");
  });

  it("returns cleaned title with no categories selected", () => {
    const result = normalizeTitle("USB Cable Black 6ft", []);
    expect(result).toContain("usb");
    expect(result).toContain("cable");
    expect(result).toContain("black");
    expect(result).toContain("6ft");
  });

  it("removes noise words and punctuation", () => {
    const result = normalizeTitle("Cable for the iPhone, with USB-C", []);
    expect(result).not.toMatch(/\bfor\b/);
    expect(result).not.toMatch(/\bthe\b/);
    expect(result).not.toMatch(/\bwith\b/);
  });

  it("collapses whitespace and trims", () => {
    const result = normalizeTitle("  USB   Cable   Black  ", ["color"]);
    expect(result).not.toMatch(/\s{2,}/);
    expect(result).toBe(result.trim());
  });

  it("produces identical keys for color variants of the same product", () => {
    const key1 = normalizeTitle("Wireless Mouse Black", ["color"]);
    const key2 = normalizeTitle("Wireless Mouse White", ["color"]);
    expect(key1).toBe(key2);
  });
});

describe("findDuplicates", () => {
  it("returns empty set when no dedup categories are selected", () => {
    const products = [
      makeProduct({ title: "USB Cable Black" }),
      makeProduct({ title: "USB Cable White" }),
    ];
    const result = findDuplicates(products, []);
    expect(result.size).toBe(0);
  });

  it("returns empty set for unique products", () => {
    const products = [
      makeProduct({ title: "USB Cable Black" }),
      makeProduct({ title: "Wireless Mouse Blue" }),
      makeProduct({ title: "Keyboard Silver" }),
    ];
    const result = findDuplicates(products, ["color"]);
    expect(result.size).toBe(0);
  });

  it("detects color variants and hides duplicates", () => {
    const products = [
      makeProduct({ title: "USB Cable Black", reviewCount: 50, rating: 4.0 }),
      makeProduct({ title: "USB Cable White", reviewCount: 200, rating: 4.5 }),
      makeProduct({ title: "USB Cable Red", reviewCount: 100, rating: 4.2 }),
    ];
    const result = findDuplicates(products, ["color"]);
    // Product at index 1 has most reviews, should be kept
    expect(result.size).toBe(2);
    expect(result.has(0)).toBe(true); // black - hidden
    expect(result.has(1)).toBe(false); // white - kept (most reviews)
    expect(result.has(2)).toBe(true); // red - hidden
  });

  it("keeps product with most reviews as best variant", () => {
    const products = [
      makeProduct({ title: "Headphones Black", reviewCount: 500, rating: 3.5 }),
      makeProduct({ title: "Headphones White", reviewCount: 100, rating: 4.8 }),
    ];
    const result = findDuplicates(products, ["color"]);
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(false); // kept - most reviews
    expect(result.has(1)).toBe(true); // hidden
  });

  it("uses rating as tiebreaker when review counts are equal", () => {
    const products = [
      makeProduct({ title: "Phone Case Blue", reviewCount: 100, rating: 3.5 }),
      makeProduct({ title: "Phone Case Red", reviewCount: 100, rating: 4.5 }),
      makeProduct({ title: "Phone Case Green", reviewCount: 100, rating: 4.0 }),
    ];
    const result = findDuplicates(products, ["color"]);
    expect(result.size).toBe(2);
    expect(result.has(1)).toBe(false); // kept - highest rating with same reviews
    expect(result.has(0)).toBe(true);
    expect(result.has(2)).toBe(true);
  });

  it("handles single product (no duplicates)", () => {
    const products = [makeProduct({ title: "USB Cable Black" })];
    const result = findDuplicates(products, ["color"]);
    expect(result.size).toBe(0);
  });

  it("handles empty product list", () => {
    const result = findDuplicates([], ["color"]);
    expect(result.size).toBe(0);
  });

  it("does not group products with different base titles", () => {
    const products = [
      makeProduct({ title: "USB Cable Black" }),
      makeProduct({ title: "HDMI Cable Black" }),
    ];
    const result = findDuplicates(products, ["color"]);
    expect(result.size).toBe(0);
  });

  it("handles multiple dedup categories simultaneously", () => {
    const products = [
      makeProduct({
        title: "Widget Black 10ft",
        reviewCount: 50,
        rating: 4.0,
      }),
      makeProduct({
        title: "Widget White 6ft",
        reviewCount: 200,
        rating: 4.5,
      }),
    ];
    const result = findDuplicates(products, ["color", "size"]);
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(true);
    expect(result.has(1)).toBe(false);
  });
});

describe("DEDUP_CATEGORIES", () => {
  it("has four categories defined", () => {
    expect(DEDUP_CATEGORIES).toHaveLength(4);
  });

  it("each category has required fields", () => {
    for (const cat of DEDUP_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.icon).toBeTruthy();
      expect(cat.patterns).toBeInstanceOf(RegExp);
    }
  });
});
