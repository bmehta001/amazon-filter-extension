import { describe, it, expect, vi } from "vitest";
import {
  buildExportRows,
  exportToCsv,
  exportToJson,
  exportToClipboard,
  downloadFile,
  getExportFilename,
} from "../src/content/export";
import type { EnrichmentMaps, ExportRow } from "../src/content/export";
import type { Product } from "../src/types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    element: document.createElement("div"),
    title: "Test Product",
    reviewCount: 100,
    rating: 4.5,
    price: 29.99,
    brand: "TestBrand",
    isSponsored: false,
    asin: "B000TEST01",
    ...overrides,
  };
}

function emptyMaps(): EnrichmentMaps {
  return {
    reviewScoreMap: new Map(),
    trustScoreMap: new Map(),
    sellerTrustMap: new Map(),
    listingIntegrityMap: new Map(),
    originMap: new Map(),
    dealScoreMap: new Map(),
    summaryMap: new Map(),
  };
}

describe("buildExportRows", () => {
  it("converts products to export rows", () => {
    const products = [makeProduct()];
    const rows = buildExportRows(products, emptyMaps());
    expect(rows).toHaveLength(1);
    expect(rows[0].asin).toBe("B000TEST01");
    expect(rows[0].title).toBe("Test Product");
    expect(rows[0].brand).toBe("TestBrand");
    expect(rows[0].price).toBe(29.99);
    expect(rows[0].rating).toBe(4.5);
    expect(rows[0].reviewCount).toBe(100);
    expect(rows[0].url).toBe("https://www.amazon.com/dp/B000TEST01");
  });

  it("skips products without ASIN", () => {
    const products = [makeProduct({ asin: null })];
    const rows = buildExportRows(products, emptyMaps());
    expect(rows).toHaveLength(0);
  });

  it("attaches enrichment data from maps", () => {
    const asin = "B000TEST01";
    const maps = emptyMaps();
    maps.reviewScoreMap.set(asin, { score: 85, deductions: 15, reasons: [] } as any);
    maps.trustScoreMap.set(asin, { score: 72, tier: "trusted", signals: [] } as any);
    maps.sellerTrustMap.set(asin, { score: 60, tier: "neutral", signals: [] } as any);
    maps.listingIntegrityMap.set(asin, { score: 90, tier: "clean", signals: [] } as any);
    maps.originMap.set(asin, "China");
    maps.dealScoreMap.set(asin, 78);
    maps.summaryMap.set(asin, { pros: [], cons: [], oneLiner: "Great sound" } as any);

    const rows = buildExportRows([makeProduct()], maps);
    expect(rows[0].reviewQuality).toBe(85);
    expect(rows[0].trustScore).toBe(72);
    expect(rows[0].sellerTrust).toBe(60);
    expect(rows[0].listingIntegrity).toBe(90);
    expect(rows[0].countryOfOrigin).toBe("China");
    expect(rows[0].dealScore).toBe(78);
    expect(rows[0].reviewSummary).toBe("Great sound");
  });

  it("handles missing enrichment gracefully", () => {
    const rows = buildExportRows([makeProduct()], emptyMaps());
    expect(rows[0].reviewQuality).toBeNull();
    expect(rows[0].trustScore).toBeNull();
    expect(rows[0].sellerTrust).toBeNull();
    expect(rows[0].listingIntegrity).toBeNull();
    expect(rows[0].dealScore).toBeNull();
    expect(rows[0].countryOfOrigin).toBe("");
    expect(rows[0].reviewSummary).toBe("");
  });

  it("includes seller info from product", () => {
    const product = makeProduct({
      seller: { sellerName: "Amazon.com", fulfillment: "amazon" },
    });
    const rows = buildExportRows([product], emptyMaps());
    expect(rows[0].seller).toBe("Amazon.com");
    expect(rows[0].fulfillment).toBe("amazon");
  });

  it("includes list price and coupon status", () => {
    const product = makeProduct({ listPrice: 49.99 });
    const rows = buildExportRows([product], emptyMaps());
    expect(rows[0].listPrice).toBe(49.99);
  });

  it("handles null price", () => {
    const product = makeProduct({ price: null });
    const rows = buildExportRows([product], emptyMaps());
    expect(rows[0].price).toBeNull();
  });

  it("exports multiple products in order", () => {
    const products = [
      makeProduct({ asin: "B001", title: "First" }),
      makeProduct({ asin: "B002", title: "Second" }),
      makeProduct({ asin: "B003", title: "Third" }),
    ];
    const rows = buildExportRows(products, emptyMaps());
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.title)).toEqual(["First", "Second", "Third"]);
  });
});

describe("exportToCsv", () => {
  it("produces valid CSV with headers", () => {
    const rows = buildExportRows([makeProduct()], emptyMaps());
    const csv = exportToCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("ASIN");
    expect(lines[0]).toContain("Title");
    expect(lines[0]).toContain("Brand");
    expect(lines[0]).toContain("Price");
    expect(lines[0]).toContain("Rating");
    expect(lines[0]).toContain("URL");
    expect(lines).toHaveLength(2); // header + 1 row
  });

  it("escapes commas in values", () => {
    const product = makeProduct({ title: 'Product, with "quotes"' });
    const rows = buildExportRows([product], emptyMaps());
    const csv = exportToCsv(rows);
    // The title should be wrapped in quotes with internal quotes doubled
    expect(csv).toContain('"Product, with ""quotes"""');
  });

  it("handles empty rows", () => {
    const csv = exportToCsv([]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1); // header only
  });

  it("converts boolean to Yes/No", () => {
    const product = makeProduct({ isSponsored: true });
    const rows = buildExportRows([product], emptyMaps());
    const csv = exportToCsv(rows);
    expect(csv).toContain("Yes");
  });

  it("represents null values as empty strings", () => {
    const rows = buildExportRows([makeProduct({ price: null })], emptyMaps());
    const csv = exportToCsv(rows);
    const dataLine = csv.split("\n")[1];
    // Price column should be empty
    const cols = dataLine.split(",");
    const priceIdx = csv.split("\n")[0].split(",").indexOf("Price");
    expect(cols[priceIdx]).toBe("");
  });
});

describe("exportToJson", () => {
  it("produces valid JSON", () => {
    const rows = buildExportRows([makeProduct()], emptyMaps());
    const json = exportToJson(rows);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].asin).toBe("B000TEST01");
  });

  it("is pretty-printed", () => {
    const rows = buildExportRows([makeProduct()], emptyMaps());
    const json = exportToJson(rows);
    expect(json).toContain("\n");
    expect(json).toContain("  ");
  });
});

describe("exportToClipboard", () => {
  it("produces tab-separated output", () => {
    const rows = buildExportRows([makeProduct()], emptyMaps());
    const tsv = exportToClipboard(rows);
    const lines = tsv.split("\n");
    expect(lines[0]).toContain("\t");
    expect(lines[0]).toContain("ASIN");
    const dataCols = lines[1].split("\t");
    expect(dataCols[0]).toBe("B000TEST01");
  });
});

describe("downloadFile", () => {
  it("creates a temporary link and triggers download", () => {
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;

    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        vi.spyOn(el, "click").mockImplementation(clickSpy);
      }
      return el;
    });

    downloadFile("test content", "test.csv", "text/csv");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");

    vi.restoreAllMocks();
  });
});

describe("getExportFilename", () => {
  it("generates filename with search query", () => {
    // Mock window.location.search
    Object.defineProperty(window, "location", {
      value: { search: "?k=wireless+headphones&ref=nb_sb_noss" },
      writable: true,
    });

    const name = getExportFilename("csv");
    expect(name).toMatch(/^amazon_wireless_headphones/);
    expect(name).toMatch(/\.csv$/);
    expect(name).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("handles missing search query", () => {
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
    });

    const name = getExportFilename("json");
    expect(name).toMatch(/^amazon_search_.*\.json$/);
  });

  it("sanitizes special characters", () => {
    Object.defineProperty(window, "location", {
      value: { search: "?k=baby+bottles+%26+nipples" },
      writable: true,
    });

    const name = getExportFilename("csv");
    // Should not contain special chars
    expect(name).not.toMatch(/[^a-zA-Z0-9._-]/);
  });
});

// ── Edge case tests ─────────────────────────────────────────────────

describe("buildExportRows edge cases", () => {
  it("filters products with asin = undefined", () => {
    const rows = buildExportRows([makeProduct({ asin: undefined })], emptyMaps());
    expect(rows).toHaveLength(0);
  });

  it("handles empty product list", () => {
    const rows = buildExportRows([], emptyMaps());
    expect(rows).toHaveLength(0);
  });

  it("handles product with price = 0", () => {
    const rows = buildExportRows([makeProduct({ price: 0 })], emptyMaps());
    expect(rows[0].price).toBe(0);
  });

  it("handles product with empty string brand", () => {
    const rows = buildExportRows([makeProduct({ brand: "" })], emptyMaps());
    expect(rows[0].brand).toBe("");
  });

  it("handles product with no seller", () => {
    const rows = buildExportRows([makeProduct({ seller: undefined })], emptyMaps());
    expect(rows[0].seller).toBe("");
    expect(rows[0].fulfillment).toBe("");
  });

  it("prefers product countryOfOrigin over originMap", () => {
    const maps = emptyMaps();
    maps.originMap.set("B000TEST01", "Japan");
    const rows = buildExportRows([makeProduct({ countryOfOrigin: "China" })], maps);
    expect(rows[0].countryOfOrigin).toBe("China");
  });

  it("falls back to originMap when product has no countryOfOrigin", () => {
    const maps = emptyMaps();
    maps.originMap.set("B000TEST01", "Germany");
    const rows = buildExportRows([makeProduct()], maps);
    expect(rows[0].countryOfOrigin).toBe("Germany");
  });

  it("handles dealScore of 0 (not null)", () => {
    const maps = emptyMaps();
    maps.dealScoreMap.set("B000TEST01", 0);
    const rows = buildExportRows([makeProduct()], maps);
    expect(rows[0].dealScore).toBe(0);
  });
});

describe("exportToCsv edge cases", () => {
  it("escapes newlines in field values", () => {
    const row: ExportRow = {
      asin: "B001", title: "Line1\nLine2", brand: "B", price: 10,
      listPrice: null, effectivePrice: null, subscribeAndSave: null,
      rating: 4, reviewCount: 50, isSponsored: false,
      seller: "", fulfillment: "", countryOfOrigin: "", reviewQuality: null,
      trustScore: null, sellerTrust: null, listingIntegrity: null,
      dealScore: null, reviewSummary: "", url: "https://amazon.com/dp/B001",
    };
    const csv = exportToCsv([row]);
    // Newline in value must be inside quotes
    expect(csv).toContain('"Line1\nLine2"');
  });

  it("escapes combined commas, quotes, and newlines", () => {
    const row: ExportRow = {
      asin: "B001", title: 'He said, "wow"\nAmazing', brand: "B", price: 10,
      listPrice: null, effectivePrice: null, subscribeAndSave: null,
      rating: 4, reviewCount: 50, isSponsored: false,
      seller: "", fulfillment: "", countryOfOrigin: "", reviewQuality: null,
      trustScore: null, sellerTrust: null, listingIntegrity: null,
      dealScore: null, reviewSummary: "", url: "https://amazon.com/dp/B001",
    };
    const csv = exportToCsv([row]);
    expect(csv).toContain('"He said, ""wow""\nAmazing"');
  });

  it("converts isSponsored=false to No", () => {
    const rows = buildExportRows([makeProduct({ isSponsored: false })], emptyMaps());
    const csv = exportToCsv(rows);
    expect(csv).toContain("No");
  });
});

describe("exportToClipboard edge cases", () => {
  it("handles empty rows array", () => {
    const tsv = exportToClipboard([]);
    const lines = tsv.split("\n");
    expect(lines).toHaveLength(1); // header only
  });

  it("does not escape tabs in values (raw TSV)", () => {
    const row: ExportRow = {
      asin: "B001", title: "Tab\there", brand: "B", price: 10,
      listPrice: null, effectivePrice: null, subscribeAndSave: null,
      rating: 4, reviewCount: 50, isSponsored: false,
      seller: "", fulfillment: "", countryOfOrigin: "", reviewQuality: null,
      trustScore: null, sellerTrust: null, listingIntegrity: null,
      dealScore: null, reviewSummary: "", url: "https://amazon.com/dp/B001",
    };
    const tsv = exportToClipboard([row]);
    // Tab in title will create extra columns (expected limitation)
    const cols = tsv.split("\n")[1].split("\t");
    expect(cols.length).toBeGreaterThan(20); // header has 20 cols, extra from embedded tab
  });
});

describe("getExportFilename edge cases", () => {
  it("truncates very long queries to 40 chars", () => {
    Object.defineProperty(window, "location", {
      value: { search: "?k=" + "a".repeat(100) },
      writable: true,
    });
    const name = getExportFilename("csv");
    // amazon_ prefix + 40 chars max + _date + .csv
    const queryPart = name.replace(/^amazon_/, "").replace(/_\d{4}-\d{2}-\d{2}\.csv$/, "");
    expect(queryPart.length).toBeLessThanOrEqual(40);
  });
});
