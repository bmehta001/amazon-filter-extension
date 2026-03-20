import { describe, it, expect } from "vitest";
import {
  analyzeFulfillment,
  analyzeBrandSellerMatch,
  analyzeSellerName,
  analyzeReviewPriceAnomaly,
  computeSellerTrust,
} from "../src/seller/trust";
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

// ── Fulfillment Signal ──

describe("analyzeFulfillment", () => {
  it("gives max points for Amazon-sold products", () => {
    const signal = analyzeFulfillment(makeSeller({ sellerName: "Amazon.com", fulfillment: "amazon" }));
    expect(signal.points).toBe(25);
    expect(signal.severity).toBe("none");
  });

  it("gives moderate points for FBA", () => {
    const signal = analyzeFulfillment(makeSeller({ fulfillment: "fba" }));
    expect(signal.points).toBe(10);
    expect(signal.severity).toBe("low");
  });

  it("penalizes third-party fulfillment", () => {
    const signal = analyzeFulfillment(makeSeller({ fulfillment: "third-party" }));
    expect(signal.points).toBe(-10);
    expect(signal.severity).toBe("medium");
  });

  it("penalizes unknown fulfillment", () => {
    const signal = analyzeFulfillment(makeSeller({ fulfillment: "unknown" }));
    expect(signal.points).toBe(-10);
  });
});

// ── Brand-Seller Match ──

describe("analyzeBrandSellerMatch", () => {
  it("rewards when seller name matches brand", () => {
    const signal = analyzeBrandSellerMatch(
      makeSeller({ sellerName: "Samsung Direct" }),
      "Samsung",
    );
    expect(signal.points).toBe(15);
    expect(signal.severity).toBe("none");
  });

  it("rewards Amazon seller regardless of brand", () => {
    const signal = analyzeBrandSellerMatch(
      makeSeller({ sellerName: "Amazon.com", fulfillment: "amazon" }),
      "Samsung",
    );
    expect(signal.points).toBe(10);
  });

  it("penalizes brand-seller mismatch", () => {
    const signal = analyzeBrandSellerMatch(
      makeSeller({ sellerName: "RandomDeals LLC" }),
      "Samsung",
    );
    expect(signal.points).toBe(-5);
    expect(signal.severity).toBe("low");
  });

  it("is neutral when brand is unknown", () => {
    const signal = analyzeBrandSellerMatch(makeSeller(), "");
    expect(signal.points).toBe(0);
  });

  it("matches case-insensitively", () => {
    const signal = analyzeBrandSellerMatch(
      makeSeller({ sellerName: "ANKER OFFICIAL" }),
      "Anker",
    );
    expect(signal.points).toBe(15);
  });
});

// ── Seller Name Quality ──

describe("analyzeSellerName", () => {
  it("rewards Amazon seller", () => {
    const signal = analyzeSellerName(makeSeller({ sellerName: "Amazon.com" }));
    expect(signal.points).toBe(5);
    expect(signal.severity).toBe("none");
  });

  it("rewards normal business name", () => {
    const signal = analyzeSellerName(makeSeller({ sellerName: "TechStore LLC" }));
    expect(signal.points).toBe(5);
  });

  it("penalizes very short name", () => {
    const signal = analyzeSellerName(makeSeller({ sellerName: "AB" }));
    expect(signal.points).toBe(-8);
    expect(signal.severity).toBe("medium");
  });

  it("penalizes auto-generated alphanumeric name", () => {
    const signal = analyzeSellerName(makeSeller({ sellerName: "xk39fjwl8m2b" }));
    expect(signal.points).toBe(-10);
    expect(signal.severity).toBe("high");
  });

  it("penalizes gibberish long single word", () => {
    const signal = analyzeSellerName(makeSeller({ sellerName: "qwertyuiopasdfg" }));
    expect(signal.points).toBe(-6);
    expect(signal.severity).toBe("medium");
  });

  it("penalizes all-caps long name", () => {
    const signal = analyzeSellerName(makeSeller({ sellerName: "SUPER MEGA DEALS STORE" }));
    expect(signal.points).toBe(-3);
    expect(signal.severity).toBe("low");
  });

  it("accepts multi-word business names", () => {
    const signal = analyzeSellerName(makeSeller({ sellerName: "Anker Official Store" }));
    expect(signal.points).toBe(5);
  });
});

// ── Review-Price Anomaly ──

describe("analyzeReviewPriceAnomaly", () => {
  it("flags very cheap product with massive reviews", () => {
    const signal = analyzeReviewPriceAnomaly({ price: 3.99, reviewCount: 50000 });
    expect(signal.points).toBe(-8);
    expect(signal.severity).toBe("high");
  });

  it("flags cheap product with high reviews", () => {
    const signal = analyzeReviewPriceAnomaly({ price: 9.99, reviewCount: 10000 });
    expect(signal.points).toBe(-4);
    expect(signal.severity).toBe("low");
  });

  it("does not flag normal priced product with many reviews", () => {
    const signal = analyzeReviewPriceAnomaly({ price: 49.99, reviewCount: 5000 });
    expect(signal.points).toBe(0);
    expect(signal.severity).toBe("none");
  });

  it("does not flag product with few reviews", () => {
    const signal = analyzeReviewPriceAnomaly({ price: 5.99, reviewCount: 50 });
    expect(signal.points).toBe(0);
  });

  it("handles null price gracefully", () => {
    const signal = analyzeReviewPriceAnomaly({ price: null, reviewCount: 1000 });
    expect(signal.points).toBe(0);
  });
});

// ── Composite Score ──

describe("computeSellerTrust", () => {
  it("returns null when no seller info", () => {
    const result = computeSellerTrust(makeProduct({ seller: undefined }));
    expect(result).toBeNull();
  });

  it("gives high score for Amazon-sold brand-matching product", () => {
    const result = computeSellerTrust(makeProduct({
      seller: makeSeller({ sellerName: "Amazon.com", fulfillment: "amazon" }),
      brand: "TestBrand",
      price: 49.99,
      reviewCount: 200,
    }));
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(70);
    expect(result!.label).toBe("trusted");
    expect(result!.color).toBe("green");
  });

  it("gives moderate score for FBA seller with brand mismatch", () => {
    const result = computeSellerTrust(makeProduct({
      seller: makeSeller({ sellerName: "RandomStore", fulfillment: "fba" }),
      brand: "Samsung",
    }));
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(40);
    expect(result!.score).toBeLessThan(70);
  });

  it("gives low score for suspicious third-party seller", () => {
    const result = computeSellerTrust(makeProduct({
      seller: makeSeller({ sellerName: "xk39fjwl8m2b", fulfillment: "third-party" }),
      brand: "Apple",
      price: 4.99,
      reviewCount: 30000,
    }));
    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThan(30);
    expect(["caution", "risky"]).toContain(result!.label);
  });

  it("includes all 4 signals", () => {
    const result = computeSellerTrust(makeProduct());
    expect(result).not.toBeNull();
    expect(result!.signals.length).toBe(4);
    const ids = result!.signals.map((s) => s.id);
    expect(ids).toContain("fulfillment");
    expect(ids).toContain("brand-match");
    expect(ids).toContain("seller-name");
    expect(ids).toContain("review-price");
  });

  it("generates summary with seller name and score", () => {
    const result = computeSellerTrust(makeProduct({
      seller: makeSeller({ sellerName: "MyStore", fulfillment: "fba" }),
    }));
    expect(result).not.toBeNull();
    expect(result!.summary).toContain("MyStore");
    expect(result!.summary).toContain("/100");
  });

  it("scores brand-matched FBA seller as trusted", () => {
    const result = computeSellerTrust(makeProduct({
      seller: makeSeller({ sellerName: "Anker Official", fulfillment: "fba" }),
      brand: "Anker",
      price: 25.99,
      reviewCount: 300,
    }));
    expect(result).not.toBeNull();
    // FBA(+10) + brand match(+15) + good name(+5) + normal ratio(0) = 50+30 = 80
    expect(result!.score).toBeGreaterThanOrEqual(70);
    expect(result!.label).toBe("trusted");
  });
});
