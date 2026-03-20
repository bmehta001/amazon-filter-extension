import { describe, it, expect } from "vitest";
import {
  analyzeSellerCount,
  analyzeBrandListingMatch,
  analyzePriceUndercut,
  analyzeFulfillmentRisk,
  computeListingIntegrity,
} from "../src/seller/listingSignals";
import type { Product, SellerInfo } from "../src/types";

function makeSeller(overrides: Partial<SellerInfo> = {}): SellerInfo {
  return {
    sellerName: "TechStore LLC",
    fulfillment: "fba",
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    element: document.createElement("div"),
    title: "Test Product",
    reviewCount: 500,
    rating: 4.2,
    price: 29.99,
    brand: "TestBrand",
    isSponsored: false,
    asin: "B0TEST1234",
    seller: makeSeller(),
    ...overrides,
  };
}

// ── Signal 1: Seller Count ──

describe("analyzeSellerCount", () => {
  it("rewards Amazon as primary seller", () => {
    const signal = analyzeSellerCount(
      makeSeller({ sellerName: "Amazon.com", fulfillment: "amazon", otherSellersCount: 5 }),
      "TestBrand",
    );
    expect(signal.points).toBe(15);
    expect(signal.severity).toBe("none");
  });

  it("rewards multiple third-party sellers (healthy marketplace)", () => {
    const signal = analyzeSellerCount(
      makeSeller({ otherSellersCount: 5 }),
      "TestBrand",
    );
    expect(signal.points).toBe(10);
    expect(signal.reason).toContain("6 sellers");
  });

  it("flags sole third-party seller on branded product", () => {
    const signal = analyzeSellerCount(
      makeSeller({ sellerName: "RandomStore", otherSellersCount: 0 }),
      "Samsung",
    );
    expect(signal.points).toBe(-10);
    expect(signal.severity).toBe("medium");
  });

  it("is neutral for sole seller matching brand", () => {
    const signal = analyzeSellerCount(
      makeSeller({ sellerName: "Samsung Direct", otherSellersCount: 0 }),
      "Samsung",
    );
    // Seller matches brand, so not flagged as sole unknown seller
    expect(signal.points).toBeGreaterThanOrEqual(0);
  });

  it("is neutral for few sellers", () => {
    const signal = analyzeSellerCount(
      makeSeller({ otherSellersCount: 1 }),
      "TestBrand",
    );
    expect(signal.points).toBe(0);
  });
});

// ── Signal 2: Brand-Listing Match ──

describe("analyzeBrandListingMatch", () => {
  it("rewards Amazon seller", () => {
    const signal = analyzeBrandListingMatch(
      makeSeller({ sellerName: "Amazon.com", fulfillment: "amazon" }),
      "Samsung",
      500,
    );
    expect(signal.points).toBe(5);
  });

  it("rewards brand-matching seller", () => {
    const signal = analyzeBrandListingMatch(
      makeSeller({ sellerName: "Samsung Electronics" }),
      "Samsung",
      1000,
    );
    expect(signal.points).toBe(15);
  });

  it("heavily flags mismatch on established listing", () => {
    const signal = analyzeBrandListingMatch(
      makeSeller({ sellerName: "RandomDeals" }),
      "Apple",
      5000,
    );
    expect(signal.points).toBe(-12);
    expect(signal.severity).toBe("high");
    expect(signal.reason).toContain("listing hijack");
  });

  it("moderate flag on popular listing", () => {
    const signal = analyzeBrandListingMatch(
      makeSeller({ sellerName: "RandomDeals" }),
      "Anker",
      300,
    );
    expect(signal.points).toBe(-6);
    expect(signal.severity).toBe("medium");
  });

  it("light flag on new listing", () => {
    const signal = analyzeBrandListingMatch(
      makeSeller({ sellerName: "RandomDeals" }),
      "Anker",
      50,
    );
    expect(signal.points).toBe(-3);
    expect(signal.severity).toBe("low");
  });

  it("is neutral when brand unknown", () => {
    const signal = analyzeBrandListingMatch(
      makeSeller(),
      "",
      500,
    );
    expect(signal.points).toBe(5);
  });
});

// ── Signal 3: Price Undercut ──

describe("analyzePriceUndercut", () => {
  it("flags massive undercut", () => {
    const signal = analyzePriceUndercut({
      price: 15.00,
      seller: makeSeller({ otherSellersMinPrice: 30.00 }),
    });
    expect(signal.points).toBe(-10);
    expect(signal.severity).toBe("high");
    expect(signal.reason).toContain("50%");
  });

  it("flags moderate undercut", () => {
    const signal = analyzePriceUndercut({
      price: 20.00,
      seller: makeSeller({ otherSellersMinPrice: 28.00 }),
    });
    expect(signal.points).toBe(-4);
    expect(signal.severity).toBe("low");
  });

  it("does not flag competitive pricing", () => {
    const signal = analyzePriceUndercut({
      price: 27.00,
      seller: makeSeller({ otherSellersMinPrice: 29.99 }),
    });
    expect(signal.points).toBeGreaterThanOrEqual(0);
  });

  it("does not flag Amazon seller even with low price", () => {
    const signal = analyzePriceUndercut({
      price: 10.00,
      seller: makeSeller({ sellerName: "Amazon.com", fulfillment: "amazon", otherSellersMinPrice: 25.00 }),
    });
    expect(signal.points).toBeGreaterThanOrEqual(0);
  });

  it("handles missing other sellers price", () => {
    const signal = analyzePriceUndercut({
      price: 20.00,
      seller: makeSeller(),
    });
    expect(signal.points).toBe(0);
  });

  it("rewards premium pricing", () => {
    const signal = analyzePriceUndercut({
      price: 35.00,
      seller: makeSeller({ otherSellersMinPrice: 25.00 }),
    });
    expect(signal.points).toBe(5);
  });
});

// ── Signal 4: Fulfillment Risk ──

describe("analyzeFulfillmentRisk", () => {
  it("rewards Amazon fulfillment", () => {
    const signal = analyzeFulfillmentRisk(
      makeSeller({ fulfillment: "amazon" }),
      "Apple",
      999.00,
    );
    expect(signal.points).toBe(10);
  });

  it("rewards FBA", () => {
    const signal = analyzeFulfillmentRisk(
      makeSeller({ fulfillment: "fba" }),
      "Apple",
      999.00,
    );
    expect(signal.points).toBe(10);
  });

  it("heavily flags third-party on premium brand + high price", () => {
    const signal = analyzeFulfillmentRisk(
      makeSeller({ fulfillment: "third-party" }),
      "Apple",
      199.00,
    );
    expect(signal.points).toBe(-8);
    expect(signal.severity).toBe("high");
  });

  it("moderate flag for premium brand, lower price", () => {
    const signal = analyzeFulfillmentRisk(
      makeSeller({ fulfillment: "third-party" }),
      "Sony",
      30.00,
    );
    expect(signal.points).toBe(-4);
    expect(signal.severity).toBe("medium");
  });

  it("low flag for unknown brand third-party", () => {
    const signal = analyzeFulfillmentRisk(
      makeSeller({ fulfillment: "third-party" }),
      "RandomBrand",
      15.00,
    );
    expect(signal.points).toBe(0);
    expect(signal.severity).toBe("low");
  });
});

// ── Composite Score ──

describe("computeListingIntegrity", () => {
  it("returns null when no seller info", () => {
    const result = computeListingIntegrity(makeProduct({ seller: undefined }));
    expect(result).toBeNull();
  });

  it("gives high score for Amazon-sold product", () => {
    const result = computeListingIntegrity(makeProduct({
      seller: makeSeller({ sellerName: "Amazon.com", fulfillment: "amazon", otherSellersCount: 3 }),
      brand: "Samsung",
    }));
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(70);
    expect(result!.label).toBe("verified");
    expect(result!.color).toBe("green");
  });

  it("gives moderate score for FBA seller with some competition", () => {
    const result = computeListingIntegrity(makeProduct({
      seller: makeSeller({ sellerName: "GoodStore", fulfillment: "fba", otherSellersCount: 4 }),
      brand: "TestBrand",
      reviewCount: 200,
    }));
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(45);
  });

  it("gives low score for suspicious listing hijack pattern", () => {
    const result = computeListingIntegrity(makeProduct({
      seller: makeSeller({
        sellerName: "RandomStore",
        fulfillment: "third-party",
        otherSellersCount: 0,
        otherSellersMinPrice: 49.99,
      }),
      brand: "Apple",
      price: 25.00,
      reviewCount: 10000,
    }));
    expect(result).not.toBeNull();
    // Sole seller (-10) + brand mismatch on huge listing (-12) + price undercut (-10) + premium third-party (-8)
    expect(result!.score).toBeLessThan(25);
    expect(["warning", "alert"]).toContain(result!.label);
  });

  it("includes all 4 signals", () => {
    const result = computeListingIntegrity(makeProduct());
    expect(result).not.toBeNull();
    expect(result!.signals.length).toBe(4);
    const ids = result!.signals.map((s) => s.id);
    expect(ids).toContain("seller-count");
    expect(ids).toContain("brand-listing");
    expect(ids).toContain("price-undercut");
    expect(ids).toContain("fulfillment-risk");
  });

  it("generates summary with score", () => {
    const result = computeListingIntegrity(makeProduct());
    expect(result).not.toBeNull();
    expect(result!.summary).toContain("/100");
  });

  it("differentiates brand-matching FBA from mismatching third-party", () => {
    const goodResult = computeListingIntegrity(makeProduct({
      seller: makeSeller({ sellerName: "Anker Direct", fulfillment: "fba", otherSellersCount: 3 }),
      brand: "Anker",
      reviewCount: 500,
    }));

    const badResult = computeListingIntegrity(makeProduct({
      seller: makeSeller({ sellerName: "RandomStore", fulfillment: "third-party", otherSellersCount: 0 }),
      brand: "Anker",
      reviewCount: 500,
    }));

    expect(goodResult!.score).toBeGreaterThan(badResult!.score + 20);
  });
});
