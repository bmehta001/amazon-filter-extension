import { describe, it, expect } from "vitest";

/**
 * Tests for seller extraction from product detail pages and seller filter logic.
 */

import { extractSellerFromDocument } from "../src/brand/fetcher";
import type { Product, FilterState } from "../src/types";
import { DEFAULT_FILTERS } from "../src/types";

// ── Chrome storage mock (needed for filters import) ──────────────────

import { vi } from "vitest";
vi.stubGlobal("chrome", {
  storage: {
    sync: { get: vi.fn(), set: vi.fn() },
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined },
});

import { applyFilters } from "../src/content/filters";

// ── Helper: create mock product detail page ──────────────────────────

function createSellerDoc(opts: {
  merchantInfo?: string;
  tabularBuyBox?: { soldBy?: string; shipsFrom?: string };
  sellerLink?: string;
} = {}): Document {
  const html: string[] = ["<html><body>"];

  if (opts.merchantInfo) {
    html.push(`<div id="merchant-info">${opts.merchantInfo}</div>`);
  }

  if (opts.tabularBuyBox) {
    html.push('<div id="tabular-buybox">');
    if (opts.tabularBuyBox.soldBy) {
      html.push(`<span class="tabular-buybox-text-label">Sold by</span>`);
      html.push(`<span class="tabular-buybox-text">${opts.tabularBuyBox.soldBy}</span>`);
    }
    if (opts.tabularBuyBox.shipsFrom) {
      html.push(`<span class="tabular-buybox-text-label">Ships from</span>`);
      html.push(`<span class="tabular-buybox-text">${opts.tabularBuyBox.shipsFrom}</span>`);
    }
    html.push("</div>");
  }

  if (opts.sellerLink) {
    html.push(`<a id="sellerProfileTriggerId">${opts.sellerLink}</a>`);
  }

  html.push("</body></html>");
  const parser = new DOMParser();
  return parser.parseFromString(html.join(""), "text/html");
}

function mockProduct(overrides: Partial<Product> = {}): Product {
  return {
    element: document.createElement("div"),
    title: "Test Product",
    reviewCount: 100,
    rating: 4.5,
    price: 29.99,
    brand: "TestBrand",
    isSponsored: false,
    asin: "B000000001",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("extractSellerFromDocument", () => {
  it("extracts 'Ships from and sold by Amazon.com'", () => {
    const doc = createSellerDoc({
      merchantInfo: "Ships from and sold by Amazon.com.",
    });
    const seller = extractSellerFromDocument(doc);
    expect(seller).toEqual({
      sellerName: "Amazon.com",
      fulfillment: "amazon",
    });
  });

  it("extracts 'Sold by X and Fulfilled by Amazon'", () => {
    const doc = createSellerDoc({
      merchantInfo: "Sold by TechShop and Fulfilled by Amazon.",
    });
    const seller = extractSellerFromDocument(doc);
    expect(seller).toEqual({
      sellerName: "TechShop",
      fulfillment: "fba",
    });
  });

  it("extracts third-party seller from seller link", () => {
    const doc = createSellerDoc({ sellerLink: "BestDeals Store" });
    const seller = extractSellerFromDocument(doc);
    expect(seller).toEqual({
      sellerName: "BestDeals Store",
      fulfillment: "third-party",
    });
  });

  it("returns Amazon fulfillment for Amazon.com seller link", () => {
    const doc = createSellerDoc({ sellerLink: "Amazon.com" });
    const seller = extractSellerFromDocument(doc);
    expect(seller).toEqual({
      sellerName: "Amazon.com",
      fulfillment: "amazon",
    });
  });

  it("returns null when no seller info found", () => {
    const doc = createSellerDoc();
    expect(extractSellerFromDocument(doc)).toBeNull();
  });

  it("extracts 'Ships from Amazon' + 'Sold by ThirdParty' as FBA", () => {
    const doc = createSellerDoc({
      merchantInfo: "Ships from Amazon.com. Sold by WidgetCorp.",
    });
    const seller = extractSellerFromDocument(doc);
    expect(seller?.fulfillment).toBe("fba");
    expect(seller?.sellerName).toBe("WidgetCorp");
  });
});

describe("Seller filter in applyFilters", () => {
  it("shows all products when filter is 'any'", async () => {
    const product = mockProduct({
      seller: { sellerName: "RandomShop", fulfillment: "third-party" },
    });
    const state: FilterState = { ...DEFAULT_FILTERS, sellerFilter: "any" };
    expect(await applyFilters(product, state)).toBe("show");
  });

  it("hides third-party when filter is 'amazon'", async () => {
    const product = mockProduct({
      seller: { sellerName: "RandomShop", fulfillment: "third-party" },
    });
    const state: FilterState = { ...DEFAULT_FILTERS, sellerFilter: "amazon" };
    expect(await applyFilters(product, state)).toBe("hide");
  });

  it("shows Amazon-sold when filter is 'amazon'", async () => {
    const product = mockProduct({
      seller: { sellerName: "Amazon.com", fulfillment: "amazon" },
    });
    const state: FilterState = { ...DEFAULT_FILTERS, sellerFilter: "amazon" };
    expect(await applyFilters(product, state)).toBe("show");
  });

  it("shows FBA when filter is 'fba'", async () => {
    const product = mockProduct({
      seller: { sellerName: "TechShop", fulfillment: "fba" },
    });
    const state: FilterState = { ...DEFAULT_FILTERS, sellerFilter: "fba" };
    expect(await applyFilters(product, state)).toBe("show");
  });

  it("shows Amazon-sold when filter is 'fba'", async () => {
    const product = mockProduct({
      seller: { sellerName: "Amazon.com", fulfillment: "amazon" },
    });
    const state: FilterState = { ...DEFAULT_FILTERS, sellerFilter: "fba" };
    expect(await applyFilters(product, state)).toBe("show");
  });

  it("hides FBA when filter is 'third-party'", async () => {
    const product = mockProduct({
      seller: { sellerName: "TechShop", fulfillment: "fba" },
    });
    const state: FilterState = { ...DEFAULT_FILTERS, sellerFilter: "third-party" };
    expect(await applyFilters(product, state)).toBe("hide");
  });

  it("does not filter when seller info is not yet loaded", async () => {
    const product = mockProduct(); // no seller field
    const state: FilterState = { ...DEFAULT_FILTERS, sellerFilter: "amazon" };
    expect(await applyFilters(product, state)).toBe("show");
  });
});
