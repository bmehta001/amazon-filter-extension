import { describe, it, expect } from "vitest";
import {
  buildFilterReasons,
  createTransparencyTooltip,
} from "../src/content/ui/transparencyTooltip";
import type {
  FilterResult,
  PageStats,
} from "../src/content/ui/transparencyTooltip";
import type { Product, FilterState } from "../src/types";
import { DEFAULT_FILTERS } from "../src/types";

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

function makePageStats(overrides: Partial<PageStats> = {}): PageStats {
  return {
    total: 48,
    visible: 40,
    hiddenSponsored: 2,
    hiddenMinReviews: 3,
    hiddenMinRating: 1,
    hiddenPrice: 0,
    hiddenBrand: 1,
    hiddenKeyword: 1,
    hiddenSeller: 0,
    hiddenDedup: 0,
    ...overrides,
  };
}

describe("buildFilterReasons", () => {
  it("returns empty reasons when all filters are off", () => {
    const product = makeProduct();
    const reasons = buildFilterReasons(product, DEFAULT_FILTERS);
    expect(reasons).toEqual([]);
  });

  it("shows pass for meeting min reviews", () => {
    const product = makeProduct({ reviewCount: 200 });
    const filters: FilterState = { ...DEFAULT_FILTERS, minReviews: 50 };
    const reasons = buildFilterReasons(product, filters);
    const reviewReason = reasons.find((r) => r.filter === "Min Reviews");
    expect(reviewReason).toBeDefined();
    expect(reviewReason!.passed).toBe(true);
    expect(reviewReason!.detail).toContain("200");
    expect(reviewReason!.detail).toContain("✓");
  });

  it("shows fail for not meeting min reviews", () => {
    const product = makeProduct({ reviewCount: 3 });
    const filters: FilterState = { ...DEFAULT_FILTERS, minReviews: 50 };
    const reasons = buildFilterReasons(product, filters);
    const reviewReason = reasons.find((r) => r.filter === "Min Reviews");
    expect(reviewReason).toBeDefined();
    expect(reviewReason!.passed).toBe(false);
    expect(reviewReason!.detail).toContain("3");
    expect(reviewReason!.detail).toContain("✗");
  });

  it("checks sponsored filter", () => {
    const product = makeProduct({ isSponsored: true });
    const filters: FilterState = { ...DEFAULT_FILTERS, hideSponsored: true };
    const reasons = buildFilterReasons(product, filters);
    const sponsored = reasons.find((r) => r.filter === "Sponsored");
    expect(sponsored).toBeDefined();
    expect(sponsored!.passed).toBe(false);
    expect(sponsored!.detail).toContain("✗");
  });

  it("checks min rating pass and fail", () => {
    const passingProduct = makeProduct({ rating: 4.5 });
    const failingProduct = makeProduct({ rating: 3.0 });
    const filters: FilterState = { ...DEFAULT_FILTERS, minRating: 4.0 };

    const passReasons = buildFilterReasons(passingProduct, filters);
    const passRating = passReasons.find((r) => r.filter === "Min Rating");
    expect(passRating!.passed).toBe(true);

    const failReasons = buildFilterReasons(failingProduct, filters);
    const failRating = failReasons.find((r) => r.filter === "Min Rating");
    expect(failRating!.passed).toBe(false);
  });

  it("checks price range within bounds", () => {
    const product = makeProduct({ price: 25.0 });
    const filters: FilterState = { ...DEFAULT_FILTERS, priceMin: 10, priceMax: 50 };
    const reasons = buildFilterReasons(product, filters);
    const priceReason = reasons.find((r) => r.filter === "Price Range");
    expect(priceReason).toBeDefined();
    expect(priceReason!.passed).toBe(true);
    expect(priceReason!.detail).toContain("$25.00");
    expect(priceReason!.detail).toContain("✓");
  });

  it("checks price range out of bounds (too high)", () => {
    const product = makeProduct({ price: 100.0 });
    const filters: FilterState = { ...DEFAULT_FILTERS, priceMax: 50 };
    const reasons = buildFilterReasons(product, filters);
    const priceReason = reasons.find((r) => r.filter === "Price Range");
    expect(priceReason).toBeDefined();
    expect(priceReason!.passed).toBe(false);
    expect(priceReason!.detail).toContain("✗");
  });

  it("handles null price gracefully", () => {
    const product = makeProduct({ price: null });
    const filters: FilterState = { ...DEFAULT_FILTERS, priceMin: 10 };
    const reasons = buildFilterReasons(product, filters);
    const priceReason = reasons.find((r) => r.filter === "Price Range");
    expect(priceReason).toBeDefined();
    expect(priceReason!.passed).toBe(true);
    expect(priceReason!.detail).toBe("No price listed");
  });

  it("checks brand exclusion", () => {
    const product = makeProduct({ brand: "BadBrand" });
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      excludedBrands: ["BadBrand"],
    };
    const reasons = buildFilterReasons(product, filters);
    const brandReason = reasons.find((r) => r.filter === "Brand");
    expect(brandReason).toBeDefined();
    expect(brandReason!.passed).toBe(false);
    expect(brandReason!.detail).toContain("excluded");
    expect(brandReason!.detail).toContain("✗");
  });

  it("checks brand exclusion is case-insensitive", () => {
    const product = makeProduct({ brand: "badbrand" });
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      excludedBrands: ["BadBrand"],
    };
    const reasons = buildFilterReasons(product, filters);
    const brandReason = reasons.find((r) => r.filter === "Brand");
    expect(brandReason!.passed).toBe(false);
  });

  it("checks trusted-only brand mode", () => {
    const untrusted = makeProduct({ brand: "Unknown", brandCertain: false });
    const trusted = makeProduct({ brand: "Trusted", brandCertain: true });
    const filters: FilterState = { ...DEFAULT_FILTERS, brandMode: "trusted-only" };

    const untrustedReasons = buildFilterReasons(untrusted, filters);
    const untrustedBrand = untrustedReasons.find((r) => r.filter === "Brand");
    expect(untrustedBrand!.passed).toBe(false);
    expect(untrustedBrand!.detail).toContain("not trusted");

    const trustedReasons = buildFilterReasons(trusted, filters);
    const trustedBrand = trustedReasons.find((r) => r.filter === "Brand");
    expect(trustedBrand!.passed).toBe(true);
    expect(trustedBrand!.detail).toContain("trusted");
  });

  it("checks keyword exclusion match", () => {
    const product = makeProduct({ title: "Great Cheap Wireless Mouse" });
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      excludeTokens: ["cheap"],
    };
    const reasons = buildFilterReasons(product, filters);
    const keywordReason = reasons.find((r) => r.filter === "Keywords");
    expect(keywordReason).toBeDefined();
    expect(keywordReason!.passed).toBe(false);
    expect(keywordReason!.detail).toContain("cheap");
    expect(keywordReason!.detail).toContain("✗");
  });

  it("checks keyword exclusion no match", () => {
    const product = makeProduct({ title: "Premium Wireless Mouse" });
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      excludeTokens: ["cheap"],
    };
    const reasons = buildFilterReasons(product, filters);
    const keywordReason = reasons.find((r) => r.filter === "Keywords");
    expect(keywordReason).toBeDefined();
    expect(keywordReason!.passed).toBe(true);
    expect(keywordReason!.detail).toContain("No excluded keywords");
  });

  it("checks seller filter for amazon-only", () => {
    const amazonProduct = makeProduct({
      seller: { sellerName: "Amazon.com", fulfillment: "amazon" },
    });
    const thirdParty = makeProduct({
      seller: { sellerName: "SomeVendor", fulfillment: "third-party" },
    });
    const filters: FilterState = { ...DEFAULT_FILTERS, sellerFilter: "amazon" };

    const amazonReasons = buildFilterReasons(amazonProduct, filters);
    const amazonSeller = amazonReasons.find((r) => r.filter === "Seller");
    expect(amazonSeller!.passed).toBe(true);
    expect(amazonSeller!.detail).toContain("Sold by Amazon");

    const tpReasons = buildFilterReasons(thirdParty, filters);
    const tpSeller = tpReasons.find((r) => r.filter === "Seller");
    expect(tpSeller!.passed).toBe(false);
    expect(tpSeller!.detail).toContain("SomeVendor");
  });

  it("checks seller filter for FBA", () => {
    const fbaProduct = makeProduct({
      seller: { sellerName: "FBASeller", fulfillment: "fba" },
    });
    const nonFba = makeProduct({
      seller: { sellerName: "MerchantFulfilled", fulfillment: "third-party" },
    });
    const filters: FilterState = { ...DEFAULT_FILTERS, sellerFilter: "fba" };

    const fbaReasons = buildFilterReasons(fbaProduct, filters);
    expect(fbaReasons.find((r) => r.filter === "Seller")!.passed).toBe(true);

    const nonFbaReasons = buildFilterReasons(nonFba, filters);
    expect(nonFbaReasons.find((r) => r.filter === "Seller")!.passed).toBe(false);
  });

  it("shows seller unknown when no seller info", () => {
    const product = makeProduct({ seller: undefined });
    const filters: FilterState = { ...DEFAULT_FILTERS, sellerFilter: "amazon" };
    const reasons = buildFilterReasons(product, filters);
    const sellerReason = reasons.find((r) => r.filter === "Seller");
    expect(sellerReason).toBeDefined();
    expect(sellerReason!.detail).toBe("Seller unknown");
  });

  it("builds multiple reasons for combined filters", () => {
    const product = makeProduct({
      isSponsored: true,
      reviewCount: 5,
      rating: 3.0,
    });
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      hideSponsored: true,
      minReviews: 50,
      minRating: 4.0,
    };
    const reasons = buildFilterReasons(product, filters);
    expect(reasons).toHaveLength(3);
    expect(reasons.map((r) => r.filter)).toEqual(["Sponsored", "Min Reviews", "Min Rating"]);
  });
});

describe("createTransparencyTooltip", () => {
  it("creates proper DOM structure", () => {
    const product = makeProduct();
    const filterResult: FilterResult = {
      action: "show",
      reasons: [{ filter: "Min Reviews", passed: true, detail: "100 reviews ✓" }],
    };
    const stats = makePageStats();
    const el = createTransparencyTooltip(product, filterResult, stats);

    expect(el.className).toBe("bas-transparency-wrapper");
    expect(el.querySelector(".bas-transparency-icon")).toBeTruthy();
    expect(el.querySelector(".bas-transparency-icon")!.textContent).toBe("ℹ️");
    expect(el.querySelector(".bas-transparency-tooltip")).toBeTruthy();
    expect(el.querySelector(".bas-tt-header")).toBeTruthy();
    expect(el.querySelector(".bas-tt-reasons")).toBeTruthy();
    expect(el.querySelector(".bas-tt-stats")).toBeTruthy();
  });

  it('shows "Passed all filters" for show action', () => {
    const product = makeProduct();
    const filterResult: FilterResult = { action: "show", reasons: [] };
    const stats = makePageStats();
    const el = createTransparencyTooltip(product, filterResult, stats);
    const header = el.querySelector(".bas-tt-header")!;
    expect(header.textContent).toContain("Passed all filters");
  });

  it('shows "Hidden by filters" for hide action', () => {
    const product = makeProduct();
    const filterResult: FilterResult = {
      action: "hide",
      reasons: [{ filter: "Min Reviews", passed: false, detail: "3 reviews ✗" }],
    };
    const stats = makePageStats();
    const el = createTransparencyTooltip(product, filterResult, stats);
    const header = el.querySelector(".bas-tt-header")!;
    expect(header.textContent).toContain("Hidden by filters");
  });

  it('shows "Dimmed" for dim action', () => {
    const product = makeProduct();
    const filterResult: FilterResult = { action: "dim", reasons: [] };
    const stats = makePageStats();
    const el = createTransparencyTooltip(product, filterResult, stats);
    const header = el.querySelector(".bas-tt-header")!;
    expect(header.textContent).toContain("Dimmed");
  });

  it("renders filter reasons with correct classes", () => {
    const product = makeProduct();
    const filterResult: FilterResult = {
      action: "show",
      reasons: [
        { filter: "Min Reviews", passed: true, detail: "100 reviews ✓" },
        { filter: "Price Range", passed: false, detail: "$100 out of range ✗" },
      ],
    };
    const stats = makePageStats();
    const el = createTransparencyTooltip(product, filterResult, stats);

    const reasons = el.querySelectorAll(".bas-tt-reason");
    expect(reasons).toHaveLength(2);
    expect(reasons[0].classList.contains("bas-tt-pass")).toBe(true);
    expect(reasons[1].classList.contains("bas-tt-fail")).toBe(true);
  });

  it("renders page stats in tooltip", () => {
    const product = makeProduct();
    const filterResult: FilterResult = { action: "show", reasons: [] };
    const stats = makePageStats({
      total: 48,
      visible: 40,
      hiddenSponsored: 3,
      hiddenMinReviews: 2,
      hiddenPrice: 0,
    });
    const el = createTransparencyTooltip(product, filterResult, stats);
    const statsDiv = el.querySelector(".bas-tt-stats")!;
    expect(statsDiv.textContent).toContain("Showing 40 of 48");
    expect(statsDiv.textContent).toContain("3 sponsored");
    expect(statsDiv.textContent).toContain("2 low reviews");
    // Price hidden count is 0, should not be in text
    expect(statsDiv.textContent).not.toContain("out of price range");
  });

  it('shows "No products filtered out" when nothing is hidden', () => {
    const product = makeProduct();
    const filterResult: FilterResult = { action: "show", reasons: [] };
    const stats = makePageStats({
      total: 20,
      visible: 20,
      hiddenSponsored: 0,
      hiddenMinReviews: 0,
      hiddenMinRating: 0,
      hiddenPrice: 0,
      hiddenBrand: 0,
      hiddenKeyword: 0,
      hiddenSeller: 0,
      hiddenDedup: 0,
    });
    const el = createTransparencyTooltip(product, filterResult, stats);
    const statsDiv = el.querySelector(".bas-tt-stats")!;
    expect(statsDiv.textContent).toContain("No products filtered out");
  });
});
