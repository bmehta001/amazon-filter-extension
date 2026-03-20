import { describe, it, expect } from "vitest";
import { extractListPrice, extractCoupon, extractDealBadge } from "../src/content/extractor";
import { computeDealScore } from "../src/content/dealScoring";
import { injectDealBadge } from "../src/content/ui/dealBadge";
import type { Product } from "../src/types";

// ── Helper ──

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    element: document.createElement("div"),
    title: "Test Product",
    reviewCount: 100,
    rating: 4.5,
    price: 29.99,
    brand: "TestBrand",
    isSponsored: false,
    asin: "B0TEST1234",
    ...overrides,
  };
}

// ── extractListPrice ──

describe("extractListPrice", () => {
  it("extracts strikethrough price from data-strikethroughprice", () => {
    const card = document.createElement("div");
    card.innerHTML = `
      <div data-strikethroughprice="true">
        <span class="a-text-strike">$49.99</span>
      </div>
    `;
    expect(extractListPrice(card)).toBe(49.99);
  });

  it("extracts from a-text-price offscreen", () => {
    const card = document.createElement("div");
    card.innerHTML = `
      <span class="a-text-price">
        <span class="a-offscreen">$59.99</span>
      </span>
    `;
    expect(extractListPrice(card)).toBe(59.99);
  });

  it("extracts from standalone a-text-strike", () => {
    const card = document.createElement("div");
    card.innerHTML = `<span class="a-text-strike">$39.99</span>`;
    expect(extractListPrice(card)).toBe(39.99);
  });

  it("returns null when no list price exists", () => {
    const card = document.createElement("div");
    card.innerHTML = `<span class="a-price"><span class="a-offscreen">$29.99</span></span>`;
    expect(extractListPrice(card)).toBeNull();
  });
});

// ── extractCoupon ──

describe("extractCoupon", () => {
  it("extracts percentage coupon", () => {
    const card = document.createElement("div");
    card.innerHTML = `
      <span data-component-type="s-coupon-component">
        <span class="s-coupon-highlight-color">Save 35%</span>
        <span> with coupon</span>
      </span>
    `;
    const coupon = extractCoupon(card);
    expect(coupon).toEqual({ type: "percent", value: 35 });
  });

  it("extracts dollar amount coupon", () => {
    const card = document.createElement("div");
    card.innerHTML = `
      <span data-component-type="s-coupon-component">
        <span>Save $5.00 with coupon</span>
      </span>
    `;
    const coupon = extractCoupon(card);
    expect(coupon).toEqual({ type: "amount", value: 5.0 });
  });

  it("returns null when no coupon component exists", () => {
    const card = document.createElement("div");
    card.innerHTML = `<span>No coupon here</span>`;
    expect(extractCoupon(card)).toBeNull();
  });

  it("returns null when coupon text is unparseable", () => {
    const card = document.createElement("div");
    card.innerHTML = `
      <span data-component-type="s-coupon-component">
        <span>Apply coupon</span>
      </span>
    `;
    expect(extractCoupon(card)).toBeNull();
  });
});

// ── extractDealBadge ──

describe("extractDealBadge", () => {
  it("detects deal badge by class", () => {
    const card = document.createElement("div");
    card.innerHTML = `<div class="_c2Itd_dealBadge_KEp1h"><span>Limited time deal</span></div>`;
    expect(extractDealBadge(card)).toBe(true);
  });

  it("detects deal badge by data attribute", () => {
    const card = document.createElement("div");
    card.innerHTML = `<div data-deal-badge="true"><span>Deal</span></div>`;
    expect(extractDealBadge(card)).toBe(true);
  });

  it("detects Limited time deal text in a-size-mini", () => {
    const card = document.createElement("div");
    card.innerHTML = `<span class="a-size-mini">Limited time deal</span>`;
    expect(extractDealBadge(card)).toBe(true);
  });

  it("returns false when no deal badge", () => {
    const card = document.createElement("div");
    card.innerHTML = `<span class="a-size-mini">Best Seller</span>`;
    expect(extractDealBadge(card)).toBe(false);
  });
});

// ── computeDealScore ──

describe("computeDealScore", () => {
  it("returns null for products with no deal signals", () => {
    const product = makeProduct();
    expect(computeDealScore(product)).toBeNull();
  });

  it("scores a product with list price discount", () => {
    const product = makeProduct({ price: 29.99, listPrice: 49.99 });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.score).toBeGreaterThan(0);
    expect(score!.effectiveDiscount).toBeGreaterThan(0);
    expect(score!.signals.some((s) => s.type === "discount")).toBe(true);
  });

  it("scores a product with coupon", () => {
    const product = makeProduct({ coupon: { type: "percent", value: 20 } });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.signals.some((s) => s.type === "coupon")).toBe(true);
  });

  it("scores a product with deal badge", () => {
    const product = makeProduct({ hasDealBadge: true });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.score).toBe(15);
    expect(score!.signals.some((s) => s.type === "deal-badge")).toBe(true);
  });

  it("gives Great Deal for large discount + coupon + badge", () => {
    const product = makeProduct({
      price: 29.99,
      listPrice: 49.99,
      coupon: { type: "percent", value: 10 },
      hasDealBadge: true,
      reviewQuality: 80, // trusted reviews unlock bonus points
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.label).toBe("Great Deal");
    expect(score!.emoji).toBe("🟢");
  });

  it("detects suspicious discount (high discount, low reviews, no badge)", () => {
    const product = makeProduct({
      price: 9.99,
      listPrice: 49.99,
      reviewCount: 5,
      hasDealBadge: false,
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.signals.some((s) => s.type === "suspicious")).toBe(true);
  });

  it("gives review trust bonus for high trust + real discount", () => {
    const product = makeProduct({
      price: 29.99,
      listPrice: 49.99,
      reviewQuality: 85,
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.signals.some((s) => s.type === "review-trust")).toBe(true);
  });

  it("combines discount + coupon for effective discount", () => {
    const product = makeProduct({
      price: 40.00,
      listPrice: 50.00,
      coupon: { type: "percent", value: 10 },
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    // 20% off list + 10% coupon → effective ~28%
    expect(score!.effectiveDiscount).toBeGreaterThan(25);
    expect(score!.effectiveDiscount).toBeLessThan(35);
  });

  it("includes empty manipulationWarnings for normal deals", () => {
    const product = makeProduct({ price: 29.99, listPrice: 39.99 });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.manipulationWarnings).toEqual([]);
  });
});

// ── Price Manipulation Detection ──

describe("computeDealScore — manipulation detection", () => {
  it("flags heavily inflated 'Was' price (2.5×+)", () => {
    const product = makeProduct({
      price: 19.99,
      listPrice: 59.99, // 3× markup
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.signals.some((s) => s.type === "manipulation")).toBe(true);
    expect(score!.manipulationWarnings.length).toBeGreaterThan(0);
    expect(score!.manipulationWarnings[0]).toContain("3.0×");
  });

  it("flags 2× markup without deal badge as borderline", () => {
    const product = makeProduct({
      price: 25.00,
      listPrice: 50.00, // 2× markup, no badge
      hasDealBadge: false,
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.signals.some((s) => s.type === "manipulation")).toBe(true);
    expect(score!.manipulationWarnings.length).toBeGreaterThan(0);
  });

  it("does NOT flag 2× with deal badge (likely real sale)", () => {
    const product = makeProduct({
      price: 25.00,
      listPrice: 50.00,
      hasDealBadge: true,
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    // Should have the discount signal but not manipulation for 2×
    const manipSignals = score!.signals.filter((s) => s.type === "manipulation");
    expect(manipSignals.length).toBe(0);
  });

  it("flags coupon-padded pricing (big coupon, no list price)", () => {
    const product = makeProduct({
      price: 49.99,
      coupon: { type: "percent", value: 40 },
      // No listPrice — the base price is the inflated one
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.signals.some((s) => s.type === "manipulation")).toBe(true);
    expect(score!.manipulationWarnings.some((w) => w.includes("coupon"))).toBe(true);
  });

  it("flags double-dipping: large list discount + large coupon", () => {
    const product = makeProduct({
      price: 20.00,
      listPrice: 50.00, // 60% off list
      coupon: { type: "percent", value: 25 }, // +25% coupon
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    // Combined 60+25 = 85% — should flag
    const doubleDipSignal = score!.signals.find(
      (s) => s.type === "manipulation" && s.description.includes("Combined"),
    );
    expect(doubleDipSignal).toBeDefined();
  });

  it("does NOT flag small coupon as manipulation", () => {
    const product = makeProduct({
      price: 29.99,
      coupon: { type: "percent", value: 10 },
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.signals.some((s) => s.type === "manipulation")).toBe(false);
    expect(score!.manipulationWarnings).toEqual([]);
  });

  it("flags price-raised-before-sale via watchlist history", () => {
    const product = makeProduct({
      price: 34.99,
      listPrice: 49.99,
    });
    const history = {
      priceWhenAdded: 29.99,
      lastKnownPrice: 29.99,
      addedAt: "2024-01-01",
    };
    const score = computeDealScore(product, history);
    expect(score).not.toBeNull();
    // Price went from $29.99 to $34.99 "sale" — raised then "discounted"
    expect(score!.signals.some((s) =>
      s.type === "manipulation" && s.description.includes("increased"),
    )).toBe(true);
  });

  it("flags 'Was' price exceeding tracked historical price", () => {
    const product = makeProduct({
      price: 24.99,
      listPrice: 59.99, // claims "was" $59.99
    });
    const history = {
      priceWhenAdded: 35.00,
      lastKnownPrice: 29.99, // we tracked it at $30, never $60
      addedAt: "2024-01-01",
    };
    const score = computeDealScore(product, history);
    expect(score).not.toBeNull();
    expect(score!.manipulationWarnings.some((w) => w.includes("tracked"))).toBe(true);
  });

  it("labels heavily manipulated product as Inflated Pricing", () => {
    const product = makeProduct({
      price: 15.00,
      listPrice: 75.00, // 5× inflated
      reviewCount: 3,
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    // The huge inflation penalty should result in "Inflated Pricing" label
    expect(["Inflated Pricing", "Suspicious Discount"]).toContain(score!.label);
  });
});

// ── injectDealBadge ──

describe("injectDealBadge", () => {
  it("injects badge next to price element", () => {
    const card = document.createElement("div");
    card.innerHTML = `<span class="a-price">$29.99</span>`;
    const dealScore = computeDealScore(
      makeProduct({ price: 19.99, listPrice: 39.99, hasDealBadge: true }),
    )!;
    injectDealBadge(card, dealScore);
    const badge = card.querySelector(".bas-deal-badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("off");
  });

  it("does not inject twice", () => {
    const card = document.createElement("div");
    card.innerHTML = `<span class="a-price">$29.99</span>`;
    const dealScore = computeDealScore(
      makeProduct({ price: 19.99, listPrice: 39.99 }),
    )!;
    injectDealBadge(card, dealScore);
    injectDealBadge(card, dealScore);
    expect(card.querySelectorAll(".bas-deal-badge").length).toBe(1);
  });

  it("does nothing when no price element", () => {
    const card = document.createElement("div");
    card.innerHTML = `<h2>Product Title</h2>`;
    const dealScore = computeDealScore(
      makeProduct({ hasDealBadge: true }),
    )!;
    injectDealBadge(card, dealScore);
    expect(card.querySelector(".bas-deal-badge")).toBeNull();
  });
});
