import { describe, it, expect } from "vitest";
import { applyFilters, applyFilterResult } from "../src/content/filters";
import type { Product, FilterState } from "../src/types";
import { DEFAULT_FILTERS } from "../src/types";

// Mock chrome.storage for tests
const mockChrome = {
  storage: {
    sync: {
      get: (_keys: unknown, cb: (result: Record<string, unknown>) => void) =>
        cb({ trustedBrands: [], blockedBrands: [] }),
      set: (_data: unknown, cb?: () => void) => cb?.(),
    },
    local: {
      get: (_keys: unknown, cb: (result: Record<string, unknown>) => void) => cb({}),
      set: (_data: unknown, cb?: () => void) => cb?.(),
    },
    onChanged: {
      addListener: () => {},
    },
  },
  runtime: {
    getURL: (path: string) => path,
  },
};

// @ts-expect-error Mock chrome global for tests
globalThis.chrome = mockChrome;

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

describe("applyFilters", () => {
  it("shows products when no filters are active", async () => {
    const product = makeProduct();
    const result = await applyFilters(product, DEFAULT_FILTERS);
    expect(result).toBe("show");
  });

  it("hides sponsored products when hideSponsored is enabled", async () => {
    const product = makeProduct({ isSponsored: true });
    const filters: FilterState = { ...DEFAULT_FILTERS, hideSponsored: true };
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });

  it("shows non-sponsored products when hideSponsored is enabled", async () => {
    const product = makeProduct({ isSponsored: false });
    const filters: FilterState = { ...DEFAULT_FILTERS, hideSponsored: true };
    const result = await applyFilters(product, filters);
    expect(result).toBe("show");
  });

  it("hides products below minimum review count", async () => {
    const product = makeProduct({ reviewCount: 50 });
    const filters: FilterState = { ...DEFAULT_FILTERS, minReviews: 100 };
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });

  it("shows products meeting minimum review count", async () => {
    const product = makeProduct({ reviewCount: 200 });
    const filters: FilterState = { ...DEFAULT_FILTERS, minReviews: 100 };
    const result = await applyFilters(product, filters);
    expect(result).toBe("show");
  });

  it("hides products below minimum rating", async () => {
    const product = makeProduct({ rating: 3.0 });
    const filters: FilterState = { ...DEFAULT_FILTERS, minRating: 4.0 };
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });

  it("hides products outside price range (below min)", async () => {
    const product = makeProduct({ price: 5 });
    const filters: FilterState = { ...DEFAULT_FILTERS, priceMin: 10 };
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });

  it("hides products outside price range (above max)", async () => {
    const product = makeProduct({ price: 100 });
    const filters: FilterState = { ...DEFAULT_FILTERS, priceMax: 50 };
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });

  it("hides products matching excluded tokens", async () => {
    const product = makeProduct({ title: "Running Shoes Hiking Boot" });
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      excludeTokens: ["hiking"],
    };
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });

  it("shows products not matching excluded tokens", async () => {
    const product = makeProduct({ title: "Running Shoes" });
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      excludeTokens: ["hiking"],
    };
    const result = await applyFilters(product, filters);
    expect(result).toBe("show");
  });

  it("keyword exclusion is case-insensitive", async () => {
    const product = makeProduct({ title: "REFURBISHED Phone" });
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      excludeTokens: ["refurbished"],
    };
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });
});

describe("applyFilterResult", () => {
  it("hides element with display:none for 'hide' result", () => {
    const el = document.createElement("div");
    applyFilterResult(el, "hide");
    expect(el.style.display).toBe("none");
    expect(el.classList.contains("bas-hidden")).toBe(true);
  });

  it("dims element for 'dim' result", () => {
    const el = document.createElement("div");
    applyFilterResult(el, "dim");
    expect(el.classList.contains("bas-dimmed")).toBe(true);
  });

  it("resets all classes for 'show' result", () => {
    const el = document.createElement("div");
    el.classList.add("bas-hidden", "bas-dimmed");
    el.style.display = "none";
    applyFilterResult(el, "show");
    expect(el.classList.contains("bas-hidden")).toBe(false);
    expect(el.classList.contains("bas-dimmed")).toBe(false);
  });
});
