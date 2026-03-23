/**
 * Tests for Subscribe & Save extraction, savings stack computation, and savings badge UI.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { extractSubscribeAndSave } from "../src/content/extractor";
import { computeSavingsStack, injectSavingsBadge, removeSavingsBadge } from "../src/content/ui/savingsBadge";
import type { Product } from "../src/types";

// ── Helpers ──────────────────────────────────────────────────────────

function makeCard(html: string): HTMLElement {
  const dom = new JSDOM(`<div data-component-type="s-search-result">${html}</div>`);
  return dom.window.document.querySelector("div") as HTMLElement;
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  const el = new JSDOM("<div></div>").window.document.createElement("div");
  return {
    element: el,
    title: "Test Product",
    reviewCount: 100,
    rating: 4.5,
    price: 50,
    brand: "TestBrand",
    isSponsored: false,
    asin: "B000TEST01",
    ...overrides,
  };
}

// ── extractSubscribeAndSave ──────────────────────────────────────────

describe("extractSubscribeAndSave", () => {
  it("returns null when no S&S info is present", () => {
    const card = makeCard("<span>Regular product</span>");
    expect(extractSubscribeAndSave(card)).toBeNull();
  });

  it("extracts percent from dedicated S&S component", () => {
    const card = makeCard(
      '<div data-component-type="s-subscribe-and-save">Save 15% with Subscribe & Save</div>',
    );
    expect(extractSubscribeAndSave(card)).toBe(15);
  });

  it("extracts percent from class-based S&S element", () => {
    const card = makeCard(
      '<span class="subscribe-save-badge">Extra 10% off when you subscribe</span>',
    );
    expect(extractSubscribeAndSave(card)).toBe(10);
  });

  it("extracts from 'Save X% with Subscribe & Save' text anywhere in card", () => {
    const card = makeCard(
      "<div><span class='a-price'>$29.99</span><span>Save 20% with Subscribe & Save</span></div>",
    );
    expect(extractSubscribeAndSave(card)).toBe(20);
  });

  it("extracts from 'X% with S&S' pattern", () => {
    const card = makeCard(
      "<div><span>5% with Subscribe and Save on this item</span></div>",
    );
    expect(extractSubscribeAndSave(card)).toBe(5);
  });

  it("extracts from 'Subscribe & Save X%' pattern (percent after keyword)", () => {
    const card = makeCard(
      "<div><span>Subscribe & Save 25% discount</span></div>",
    );
    expect(extractSubscribeAndSave(card)).toBe(25);
  });

  it("handles id-based subscribe element", () => {
    const card = makeCard(
      '<div id="subscribe-save-info">Save an extra 10% when you subscribe</div>',
    );
    expect(extractSubscribeAndSave(card)).toBe(10);
  });

  it("returns null for card with 'subscribe' in unrelated context", () => {
    const card = makeCard("<span>Subscribe to our newsletter!</span>");
    // No percentage present → null
    expect(extractSubscribeAndSave(card)).toBeNull();
  });
});

// ── computeSavingsStack ──────────────────────────────────────────────

describe("computeSavingsStack", () => {
  it("returns null when product has no price", () => {
    const product = makeProduct({ price: null });
    expect(computeSavingsStack(product)).toBeNull();
  });

  it("returns null when product has zero price", () => {
    const product = makeProduct({ price: 0 });
    expect(computeSavingsStack(product)).toBeNull();
  });

  it("returns null when no savings are available", () => {
    const product = makeProduct({ price: 50 });
    expect(computeSavingsStack(product)).toBeNull();
  });

  it("computes list price discount only", () => {
    const product = makeProduct({ price: 40, listPrice: 50 });
    const stack = computeSavingsStack(product)!;
    expect(stack).not.toBeNull();
    expect(stack.layers).toHaveLength(1);
    expect(stack.layers[0].type).toBe("list-discount");
    expect(stack.layers[0].percent).toBe(20);
    expect(stack.layers[0].amount).toBe(10);
    expect(stack.effectivePrice).toBe(40);
    expect(stack.totalPercent).toBe(20);
    expect(stack.color).toBe("amber");
  });

  it("computes percent coupon only", () => {
    const product = makeProduct({
      price: 50,
      coupon: { type: "percent", value: 10 },
    });
    const stack = computeSavingsStack(product)!;
    expect(stack).not.toBeNull();
    expect(stack.layers).toHaveLength(1);
    expect(stack.layers[0].type).toBe("coupon");
    expect(stack.layers[0].amount).toBe(5);
    expect(stack.effectivePrice).toBe(45);
    expect(stack.totalPercent).toBe(10);
    expect(stack.color).toBe("gray");
  });

  it("computes dollar coupon only", () => {
    const product = makeProduct({
      price: 100,
      coupon: { type: "amount", value: 25 },
    });
    const stack = computeSavingsStack(product)!;
    expect(stack.layers[0].amount).toBe(25);
    expect(stack.effectivePrice).toBe(75);
    expect(stack.totalPercent).toBe(25);
    expect(stack.color).toBe("amber");
  });

  it("computes S&S discount only", () => {
    const product = makeProduct({
      price: 80,
      subscribeAndSave: 15,
    });
    const stack = computeSavingsStack(product)!;
    expect(stack.layers).toHaveLength(1);
    expect(stack.layers[0].type).toBe("subscribe-save");
    expect(stack.layers[0].percent).toBe(15);
    expect(stack.layers[0].amount).toBe(12);
    expect(stack.effectivePrice).toBe(68);
  });

  it("stacks list discount + coupon + S&S multiplicatively", () => {
    const product = makeProduct({
      price: 80,
      listPrice: 100,
      coupon: { type: "percent", value: 10 },
      subscribeAndSave: 5,
    });
    const stack = computeSavingsStack(product)!;
    expect(stack.layers).toHaveLength(3);

    // Layer 1: 20% off list ($100 → $80), saves $20
    expect(stack.layers[0].type).toBe("list-discount");
    expect(stack.layers[0].amount).toBe(20);

    // Layer 2: 10% coupon on $80 = $8 saved, running = $72
    expect(stack.layers[1].type).toBe("coupon");
    expect(stack.layers[1].amount).toBe(8);

    // Layer 3: 5% S&S on $72 = $3.60 saved, running = $68.40
    expect(stack.layers[2].type).toBe("subscribe-save");
    expect(stack.layers[2].amount).toBeCloseTo(3.6, 1);

    expect(stack.effectivePrice).toBeCloseTo(68.4, 1);
    expect(stack.basePrice).toBe(100);
    expect(stack.totalPercent).toBeCloseTo(31.6, 0);
    expect(stack.color).toBe("green"); // >30%
  });

  it("includes deal badge as informational layer with zero amount", () => {
    const product = makeProduct({
      price: 40,
      listPrice: 50,
      hasDealBadge: true,
    });
    const stack = computeSavingsStack(product)!;
    expect(stack.layers).toHaveLength(2);
    expect(stack.layers[1].type).toBe("deal-badge");
    expect(stack.layers[1].amount).toBe(0);
    // effective price unchanged by deal badge
    expect(stack.effectivePrice).toBe(40);
  });

  it("caps dollar coupon to remaining price (prevents negative)", () => {
    const product = makeProduct({
      price: 10,
      coupon: { type: "amount", value: 15 },
    });
    const stack = computeSavingsStack(product)!;
    expect(stack.layers[0].amount).toBe(10); // capped at price
    expect(stack.effectivePrice).toBe(0);
  });

  it("deal badge alone returns null (no real savings)", () => {
    const product = makeProduct({
      price: 50,
      hasDealBadge: true,
    });
    // Deal badge is informational with $0 amount — no real savings
    expect(computeSavingsStack(product)).toBeNull();
  });

  it("applies color tiers correctly", () => {
    // Gray: <15% savings
    const gray = computeSavingsStack(makeProduct({ price: 90, listPrice: 100 }))!;
    expect(gray.color).toBe("gray");

    // Amber: 15-30% savings
    const amber = computeSavingsStack(makeProduct({ price: 75, listPrice: 100 }))!;
    expect(amber.color).toBe("amber");

    // Green: >30% savings
    const green = computeSavingsStack(makeProduct({ price: 60, listPrice: 100 }))!;
    expect(green.color).toBe("green");
  });
});

// ── injectSavingsBadge + removeSavingsBadge ──────────────────────────

describe("injectSavingsBadge", () => {
  let dom: JSDOM;
  let card: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM(
      '<div class="card"><span class="a-price"><span class="a-offscreen">$40.00</span></span></div>',
    );
    card = dom.window.document.querySelector(".card") as HTMLElement;
  });

  it("injects a badge element with correct class", () => {
    const stack = computeSavingsStack(makeProduct({ price: 40, listPrice: 50 }))!;
    injectSavingsBadge(card, stack);
    const badge = card.querySelector(".bas-savings-badge");
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains("bas-savings-badge--amber")).toBe(true);
  });

  it("shows total savings in badge text", () => {
    const stack = computeSavingsStack(makeProduct({ price: 40, listPrice: 50 }))!;
    injectSavingsBadge(card, stack);
    const badge = card.querySelector(".bas-savings-badge");
    expect(badge!.textContent).toContain("Save 20%");
    expect(badge!.textContent).toContain("$10.00");
    expect(badge!.textContent).toContain("$40.00");
  });

  it("includes tooltip with layer breakdown", () => {
    const product = makeProduct({
      price: 80,
      listPrice: 100,
      coupon: { type: "percent", value: 10 },
    });
    const stack = computeSavingsStack(product)!;
    injectSavingsBadge(card, stack);
    const tooltip = card.querySelector(".bas-savings-badge__tooltip");
    expect(tooltip).not.toBeNull();
    expect(tooltip!.textContent).toContain("off list");
    expect(tooltip!.textContent).toContain("coupon");
    expect(tooltip!.textContent).toContain("Effective price");
  });

  it("replaces existing badge on re-inject", () => {
    const stack = computeSavingsStack(makeProduct({ price: 40, listPrice: 50 }))!;
    injectSavingsBadge(card, stack);
    injectSavingsBadge(card, stack);
    const badges = card.querySelectorAll(".bas-savings-badge");
    expect(badges).toHaveLength(1);
  });

  it("removeSavingsBadge removes the badge", () => {
    const stack = computeSavingsStack(makeProduct({ price: 40, listPrice: 50 }))!;
    injectSavingsBadge(card, stack);
    expect(card.querySelector(".bas-savings-badge")).not.toBeNull();
    removeSavingsBadge(card);
    expect(card.querySelector(".bas-savings-badge")).toBeNull();
  });
});

// ── Deal scoring with S&S ────────────────────────────────────────────

describe("deal scoring with Subscribe & Save", () => {
  // Import dynamically so JSDOM is set up
  let computeDealScore: typeof import("../src/content/dealScoring").computeDealScore;

  beforeEach(async () => {
    const mod = await import("../src/content/dealScoring");
    computeDealScore = mod.computeDealScore;
  });

  it("factors S&S into deal score", () => {
    const product = makeProduct({
      price: 50,
      listPrice: 60,
      subscribeAndSave: 10,
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    // Should have discount signal + S&S signal
    const snsSignal = score!.signals.find((s) => s.description.includes("Subscribe & Save"));
    expect(snsSignal).toBeDefined();
    expect(snsSignal!.points).toBeGreaterThan(0);
  });

  it("returns non-null for S&S-only product (no list price or coupon)", () => {
    const product = makeProduct({
      price: 50,
      subscribeAndSave: 15,
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    expect(score!.effectiveDiscount).toBeGreaterThan(0);
  });

  it("combines S&S with coupon in effective discount", () => {
    const product = makeProduct({
      price: 80,
      listPrice: 100,
      coupon: { type: "percent", value: 10 },
      subscribeAndSave: 5,
    });
    const score = computeDealScore(product);
    expect(score).not.toBeNull();
    // effectiveDiscount should be higher than just discount + coupon
    const withoutSns = makeProduct({
      price: 80,
      listPrice: 100,
      coupon: { type: "percent", value: 10 },
    });
    const scoreWithout = computeDealScore(withoutSns)!;
    expect(score!.effectiveDiscount).toBeGreaterThan(scoreWithout.effectiveDiscount);
  });
});

// ── Effective price in filters ───────────────────────────────────────

describe("price filter with effective price", () => {
  let applyFilters: typeof import("../src/content/filters").applyFilters;

  beforeEach(async () => {
    const mod = await import("../src/content/filters");
    applyFilters = mod.applyFilters;
  });

  it("uses effectivePrice when useEffectivePrice is true", async () => {
    const product = makeProduct({
      price: 50,
      effectivePrice: 35, // after coupons
    });
    const { DEFAULT_FILTERS } = await import("../src/types");
    const state = {
      ...DEFAULT_FILTERS,
      priceMax: 40,
      useEffectivePrice: true,
    };
    // $50 sticker price > $40 max, but $35 effective < $40 → should show
    const result = await applyFilters(product, state);
    expect(result).toBe("show");
  });

  it("uses sticker price when useEffectivePrice is false", async () => {
    const product = makeProduct({
      price: 50,
      effectivePrice: 35,
    });
    const { DEFAULT_FILTERS } = await import("../src/types");
    const state = {
      ...DEFAULT_FILTERS,
      priceMax: 40,
      useEffectivePrice: false,
    };
    // $50 sticker price > $40 max → should hide
    const result = await applyFilters(product, state);
    expect(result).toBe("hide");
  });

  it("falls back to price when effectivePrice is undefined", async () => {
    const product = makeProduct({ price: 30 });
    const { DEFAULT_FILTERS } = await import("../src/types");
    const state = {
      ...DEFAULT_FILTERS,
      priceMax: 40,
      useEffectivePrice: true,
    };
    const result = await applyFilters(product, state);
    expect(result).toBe("show");
  });

  it("applies priceMin with effective price", async () => {
    const product = makeProduct({
      price: 50,
      effectivePrice: 15,
    });
    const { DEFAULT_FILTERS } = await import("../src/types");
    const state = {
      ...DEFAULT_FILTERS,
      priceMin: 20,
      useEffectivePrice: true,
    };
    // $15 effective < $20 min → should hide
    const result = await applyFilters(product, state);
    expect(result).toBe("hide");
  });
});

// ── Export includes new fields ───────────────────────────────────────

describe("export with savings fields", () => {
  let buildExportRows: typeof import("../src/content/export").buildExportRows;
  let exportToCsv: typeof import("../src/content/export").exportToCsv;

  beforeEach(async () => {
    const mod = await import("../src/content/export");
    buildExportRows = mod.buildExportRows;
    exportToCsv = mod.exportToCsv;
  });

  it("includes effectivePrice and subscribeAndSave in export rows", () => {
    const product = makeProduct({
      price: 80,
      effectivePrice: 65.5,
      subscribeAndSave: 10,
    });
    const emptyMaps = {
      reviewScoreMap: new Map(),
      trustScoreMap: new Map(),
      sellerTrustMap: new Map(),
      listingIntegrityMap: new Map(),
      originMap: new Map(),
      dealScoreMap: new Map(),
      summaryMap: new Map(),
    };
    const rows = buildExportRows([product], emptyMaps);
    expect(rows[0].effectivePrice).toBe(65.5);
    expect(rows[0].subscribeAndSave).toBe(10);
  });

  it("includes Effective Price and S&S columns in CSV header", () => {
    const emptyMaps = {
      reviewScoreMap: new Map(),
      trustScoreMap: new Map(),
      sellerTrustMap: new Map(),
      listingIntegrityMap: new Map(),
      originMap: new Map(),
      dealScoreMap: new Map(),
      summaryMap: new Map(),
    };
    const rows = buildExportRows([makeProduct()], emptyMaps);
    const csv = exportToCsv(rows);
    const header = csv.split("\n")[0];
    expect(header).toContain("Effective Price");
    expect(header).toContain("S&S Discount %");
  });

  it("exports null effective price as empty", () => {
    const product = makeProduct({ price: 50 });
    const emptyMaps = {
      reviewScoreMap: new Map(),
      trustScoreMap: new Map(),
      sellerTrustMap: new Map(),
      listingIntegrityMap: new Map(),
      originMap: new Map(),
      dealScoreMap: new Map(),
      summaryMap: new Map(),
    };
    const rows = buildExportRows([product], emptyMaps);
    expect(rows[0].effectivePrice).toBeNull();
    expect(rows[0].subscribeAndSave).toBeNull();
  });
});
