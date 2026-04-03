import { describe, it, expect, vi, beforeEach } from "vitest";

let storedData: Record<string, unknown> = {};
vi.stubGlobal("chrome", {
  storage: {
    sync: {
      get(k: string | string[], cb: (r: Record<string, unknown>) => void) {
        const keys = typeof k === "string" ? [k] : k;
        const result: Record<string, unknown> = {};
        for (const key of keys) { if (key in storedData) result[key] = storedData[key]; }
        cb(result);
      },
      set(data: Record<string, unknown>, cb?: () => void) { Object.assign(storedData, data); cb?.(); },
    },
    local: {
      get(k: string | string[], cb: (r: Record<string, unknown>) => void) {
        const keys = typeof k === "string" ? [k] : k;
        const result: Record<string, unknown> = {};
        for (const key of keys) { if (key in storedData) result[key] = storedData[key]; }
        cb(result);
      },
      set(data: Record<string, unknown>, cb?: () => void) { Object.assign(storedData, data); cb?.(); },
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined },
});

import { estimateMonthlySales, calculateMargin, analyzeCompetition } from "../src/reseller/tools";
import type { BsrInfo, Product } from "../src/types";
import { addPurchase, loadJournal, isPurchased, getPurchaseStats, rateSatisfaction } from "../src/journal/purchaseJournal";
import { createGiftPlan, addRecipient, loadGiftPlans, computeBudgetStatus } from "../src/gift/giftPlan";
import { extractPriceFromLocale, buildComparison, toLocalePrice, getLocalesToCheck } from "../src/locale/pricePeek";
import type { LocaleConfig } from "../src/locale/pricePeek";

// ── Reseller Tools ──

describe("reseller tools", () => {
  it("estimates monthly sales from BSR", () => {
    const result = estimateMonthlySales({ rank: 500, category: "Electronics" });
    expect(result.estimate).toBeGreaterThan(400);
    expect(result.estimate).toBeLessThan(900);
    expect(result.confidence).toBe("high");
  });

  it("uses default curve for unknown category", () => {
    const result = estimateMonthlySales({ rank: 1000, category: "Unknown Category" });
    expect(result.estimate).toBe(500);
  });

  it("returns low confidence for high BSR", () => {
    const result = estimateMonthlySales({ rank: 500000, category: "default" });
    expect(result.confidence).toBe("low");
  });

  it("calculates FBA margin correctly", () => {
    const margin = calculateMargin(29.99, 10.00, 1);
    expect(margin.referralFee).toBeCloseTo(4.50, 1);
    expect(margin.fbaFee).toBe(3.86);
    expect(margin.estimatedProfit).toBeCloseTo(11.63, 0);
    expect(margin.isViable).toBe(true);
  });

  it("flags low-margin products as not viable", () => {
    const margin = calculateMargin(15.00, 10.00, 1);
    expect(margin.isViable).toBe(false);
  });

  it("analyzes competition levels", () => {
    const product = { seller: { otherSellersCount: 1, fulfillment: "fba" } } as any;
    const result = analyzeCompetition(product);
    expect(result.competitionLevel).toBe("low");
    expect(result.hasFba).toBe(true);
  });

  it("detects high competition", () => {
    const product = { seller: { otherSellersCount: 8, fulfillment: "MFN" } } as any;
    expect(analyzeCompetition(product).competitionLevel).toBe("high");
  });
});

// ── Purchase Journal ──

describe("purchase journal", () => {
  beforeEach(() => { storedData = {}; });

  it("adds a purchase entry", async () => {
    await addPurchase({ asin: "B0TEST", title: "Test", brand: "Acme", price: 29.99, domain: "www.amazon.com" });
    const journal = await loadJournal();
    expect(journal.entries.length).toBe(1);
    expect(journal.entries[0].asin).toBe("B0TEST");
  });

  it("prevents duplicate purchases", async () => {
    await addPurchase({ asin: "B0TEST", title: "Test", brand: "Acme", price: 29.99, domain: "www.amazon.com" });
    await addPurchase({ asin: "B0TEST", title: "Test Again", brand: "Acme", price: 19.99, domain: "www.amazon.com" });
    const journal = await loadJournal();
    expect(journal.entries.length).toBe(1);
  });

  it("checks if purchased", async () => {
    await addPurchase({ asin: "B0TEST", title: "Test", brand: "Acme", price: 29.99, domain: "www.amazon.com" });
    expect(await isPurchased("B0TEST")).toBe(true);
    expect(await isPurchased("B0OTHER")).toBe(false);
  });

  it("rates satisfaction", async () => {
    await addPurchase({ asin: "B0TEST", title: "Test", brand: "Acme", price: 29.99, trustScore: 80, domain: "www.amazon.com" });
    await rateSatisfaction("B0TEST", 5);
    const journal = await loadJournal();
    expect(journal.entries[0].satisfaction).toBe(5);
  });

  it("computes purchase stats", async () => {
    await addPurchase({ asin: "B0A", title: "A", brand: "X", price: 20, trustScore: 90, domain: "www.amazon.com" });
    await addPurchase({ asin: "B0B", title: "B", brand: "Y", price: 30, trustScore: 40, domain: "www.amazon.com" });
    await rateSatisfaction("B0A", 5);
    await rateSatisfaction("B0B", 2);
    const stats = await getPurchaseStats();
    expect(stats.totalPurchases).toBe(2);
    expect(stats.averageTrustScore).toBe(65);
    expect(stats.satisfiedPurchaseAvgTrust).toBe(90);
    expect(stats.regrettedPurchaseAvgTrust).toBe(40);
  });
});

// ── Gift Plans ──

describe("gift plans", () => {
  beforeEach(() => { storedData = {}; });

  it("creates a gift plan", async () => {
    await createGiftPlan("Christmas 2026");
    const plans = await loadGiftPlans();
    expect(plans.length).toBe(1);
    expect(plans[0].name).toBe("Christmas 2026");
  });

  it("adds recipients to a plan", async () => {
    await createGiftPlan("Birthday");
    await addRecipient("Birthday", "Mom", 100, "Mom's Gifts");
    const plans = await loadGiftPlans();
    expect(plans[0].recipients.length).toBe(1);
    expect(plans[0].recipients[0].budget).toBe(100);
  });

  it("computes budget status", () => {
    const recipient = { name: "Dad", budget: 75, shortlistName: "Dad's Gifts" };
    const items = [{ price: 25 }, { price: 30 }, { price: null }];
    const status = computeBudgetStatus(recipient, items);
    expect(status.spent).toBe(55);
    expect(status.remaining).toBe(20);
    expect(status.overBudget).toBe(false);
    expect(status.itemCount).toBe(3);
  });

  it("detects over-budget", () => {
    const recipient = { name: "Sis", budget: 30, shortlistName: "Sis's Gifts" };
    const items = [{ price: 20 }, { price: 15 }];
    const status = computeBudgetStatus(recipient, items);
    expect(status.overBudget).toBe(true);
  });
});

// ── Multi-Locale Price Peek ──

describe("locale price peek", () => {
  it("extracts price from offscreen element", () => {
    const html = '<span class="a-offscreen">£29.99</span>';
    const locale: LocaleConfig = { domain: "www.amazon.co.uk", currency: "GBP", symbol: "£", usdRate: 1.27 };
    expect(extractPriceFromLocale(html, locale)).toBe(29.99);
  });

  it("extracts price from JSON format", () => {
    const html = '{"priceAmount": 49.99}';
    const locale: LocaleConfig = { domain: "www.amazon.com", currency: "USD", symbol: "$", usdRate: 1.0 };
    expect(extractPriceFromLocale(html, locale)).toBe(49.99);
  });

  it("returns null when no price found", () => {
    const locale: LocaleConfig = { domain: "www.amazon.com", currency: "USD", symbol: "$", usdRate: 1.0 };
    expect(extractPriceFromLocale("<div>no price</div>", locale)).toBeNull();
  });

  it("builds comparison with cheapest locale", () => {
    const prices = [
      toLocalePrice({ domain: "www.amazon.co.uk", currency: "GBP", symbol: "£", usdRate: 1.27 }, 15.99),
      toLocalePrice({ domain: "www.amazon.ca", currency: "CAD", symbol: "CA$", usdRate: 0.74 }, 28.99),
    ];
    const comparison = buildComparison("www.amazon.com", 22.99, prices);
    expect(comparison.cheapest?.locale).toBe("www.amazon.co.uk");
    expect(comparison.savingsUsd).toBeGreaterThan(0);
  });

  it("handles unavailable locales", () => {
    const prices = [
      toLocalePrice({ domain: "www.amazon.co.uk", currency: "GBP", symbol: "£", usdRate: 1.27 }, null),
    ];
    const comparison = buildComparison("www.amazon.com", 22.99, prices);
    expect(comparison.cheapest).toBeNull();
    expect(comparison.alternatives.length).toBe(0);
  });

  it("gets locales to check excluding current", () => {
    const locales = getLocalesToCheck("www.amazon.com");
    expect(locales.length).toBeLessThanOrEqual(3);
    expect(locales.every(l => l.domain !== "www.amazon.com")).toBe(true);
  });
});
