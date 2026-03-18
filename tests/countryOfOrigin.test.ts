/**
 * Tests for Country of Origin extraction and filtering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractCountryOfOrigin } from "../src/brand/fetcher";
import { applyFilters } from "../src/content/filters";
import type { Product, FilterState } from "../src/types";
import { DEFAULT_FILTERS } from "../src/types";

// ── Extraction Tests ────────────────────────────────────────────────────

describe("extractCountryOfOrigin", () => {
  function makeDoc(html: string): Document {
    return new DOMParser().parseFromString(html, "text/html");
  }

  it("extracts from po-country_of_origin table row", () => {
    const doc = makeDoc(`
      <table><tr class="po-country_of_origin">
        <td class="po-break-word">China</td>
      </tr></table>
    `);
    expect(extractCountryOfOrigin(doc)).toBe("China");
  });

  it("extracts from tech specs table", () => {
    const doc = makeDoc(`
      <table id="productDetails_techSpec_section_1">
        <tr><th>Brand</th><td>Sony</td></tr>
        <tr><th>Country of Origin</th><td>Japan</td></tr>
      </table>
    `);
    expect(extractCountryOfOrigin(doc)).toBe("Japan");
  });

  it("extracts from detail bullets with unicode marks", () => {
    const doc = makeDoc(`
      <div id="detailBullets_feature_div">
        <ul>
          <li><span class="a-list-item">Brand\u200F:\u200F Sony</span></li>
          <li><span class="a-list-item">Country of Origin\u200F:\u200F Germany</span></li>
        </ul>
      </div>
    `);
    expect(extractCountryOfOrigin(doc)).toBe("Germany");
  });

  it("extracts from additional info section", () => {
    const doc = makeDoc(`
      <table class="prodDetTable">
        <tr><th>Country of Origin</th><td>India</td></tr>
      </table>
    `);
    expect(extractCountryOfOrigin(doc)).toBe("India");
  });

  it("normalizes USA variants to United States", () => {
    for (const variant of ["USA", "U.S.A.", "United States of America"]) {
      const doc = makeDoc(`
        <table id="productDetails_techSpec_section_1">
          <tr><th>Country of Origin</th><td>${variant}</td></tr>
        </table>
      `);
      expect(extractCountryOfOrigin(doc)).toBe("United States");
    }
  });

  it("normalizes UK variants to United Kingdom", () => {
    const doc = makeDoc(`
      <table id="productDetails_techSpec_section_1">
        <tr><th>Country of Origin</th><td>UK</td></tr>
      </table>
    `);
    expect(extractCountryOfOrigin(doc)).toBe("United Kingdom");
  });

  it("normalizes PRC to China", () => {
    const doc = makeDoc(`
      <table id="productDetails_techSpec_section_1">
        <tr><th>Country of Origin</th><td>PRC</td></tr>
      </table>
    `);
    expect(extractCountryOfOrigin(doc)).toBe("China");
  });

  it("returns null when no origin info is present", () => {
    const doc = makeDoc(`
      <div id="detailBullets_feature_div">
        <ul>
          <li><span class="a-list-item">Brand: Sony</span></li>
        </ul>
      </div>
    `);
    expect(extractCountryOfOrigin(doc)).toBeNull();
  });

  it("handles extra whitespace and unicode marks", () => {
    const doc = makeDoc(`
      <table><tr class="po-country_of_origin">
        <td class="po-break-word">  \u00A0 Japan \u200F  </td>
      </tr></table>
    `);
    expect(extractCountryOfOrigin(doc)).toBe("Japan");
  });

  it("extracts from detailBullets_sections1", () => {
    const doc = makeDoc(`
      <table id="productDetails_detailBullets_sections1">
        <tr><th>Country of Origin</th><td>South Korea</td></tr>
      </table>
    `);
    expect(extractCountryOfOrigin(doc)).toBe("South Korea");
  });
});

// ── Filter Tests ────────────────────────────────────────────────────────

describe("origin filter in applyFilters", () => {
  function makeProduct(overrides: Partial<Product> = {}): Product {
    return {
      element: document.createElement("div"),
      title: "Test Product",
      reviewCount: 100,
      rating: 4.5,
      price: 29.99,
      brand: "TestBrand",
      isSponsored: false,
      asin: "B0TEST123",
      countryOfOrigin: "Japan",
      ...overrides,
    };
  }

  function makeFilters(overrides: Partial<FilterState> = {}): FilterState {
    return { ...DEFAULT_FILTERS, ...overrides };
  }

  // Mock the brand allowlist functions used by applyFilters
  vi.mock("../src/brand/allowlist", () => ({
    isAllowlisted: () => false,
    isBlocked: () => Promise.resolve(false),
  }));

  it("passes when no origin filter is set", async () => {
    const product = makeProduct({ countryOfOrigin: "China" });
    const result = await applyFilters(product, makeFilters());
    expect(result).toBe("show");
  });

  it("passes when product origin is in include list", async () => {
    const product = makeProduct({ countryOfOrigin: "Japan" });
    const filters = makeFilters({ originInclude: ["Japan", "Germany"] });
    const result = await applyFilters(product, filters);
    expect(result).toBe("show");
  });

  it("hides when product origin is not in include list", async () => {
    const product = makeProduct({ countryOfOrigin: "China" });
    const filters = makeFilters({ originInclude: ["Japan", "Germany"] });
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });

  it("hides when product origin is in exclude list", async () => {
    const product = makeProduct({ countryOfOrigin: "China" });
    const filters = makeFilters({ originExclude: ["China"] });
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });

  it("passes when product origin is not in exclude list", async () => {
    const product = makeProduct({ countryOfOrigin: "Japan" });
    const filters = makeFilters({ originExclude: ["China"] });
    const result = await applyFilters(product, filters);
    expect(result).toBe("show");
  });

  it("hides unknown origin when hideUnknownOrigin is true", async () => {
    const product = makeProduct({ countryOfOrigin: undefined });
    const filters = makeFilters({ hideUnknownOrigin: true });
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });

  it("shows unknown origin when hideUnknownOrigin is false", async () => {
    const product = makeProduct({ countryOfOrigin: undefined });
    const filters = makeFilters({ originExclude: ["China"] });
    const result = await applyFilters(product, filters);
    expect(result).toBe("show");
  });

  it("is case-insensitive", async () => {
    const product = makeProduct({ countryOfOrigin: "JAPAN" });
    const filters = makeFilters({ originInclude: ["japan"] });
    const result = await applyFilters(product, filters);
    expect(result).toBe("show");
  });

  it("exclude takes precedence over include", async () => {
    const product = makeProduct({ countryOfOrigin: "China" });
    const filters = makeFilters({ originInclude: ["China"], originExclude: ["China"] });
    const result = await applyFilters(product, filters);
    expect(result).toBe("hide");
  });

  it("uses substring matching for partial country names", async () => {
    const product = makeProduct({ countryOfOrigin: "South Korea" });
    const filters = makeFilters({ originInclude: ["Korea"] });
    const result = await applyFilters(product, filters);
    expect(result).toBe("show");
  });
});
