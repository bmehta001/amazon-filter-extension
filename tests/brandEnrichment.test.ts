import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for brand fetcher (extractBrandFromDocument) and brand cache.
 */

// ── Chrome storage mock ──────────────────────────────────────────────

let storedData: Record<string, unknown> = {};

const mockChrome = {
  storage: {
    local: {
      get(keys: string | string[] | null, cb: (result: Record<string, unknown>) => void) {
        if (keys === null) {
          cb({ ...storedData });
          return;
        }
        const keyList = typeof keys === "string" ? [keys] : keys;
        const result: Record<string, unknown> = {};
        for (const key of keyList) {
          if (key in storedData) result[key] = storedData[key];
        }
        cb(result);
      },
      set(data: Record<string, unknown>, cb?: () => void) {
        Object.assign(storedData, data);
        cb?.();
      },
      remove(keys: string | string[], cb?: () => void) {
        const keyList = typeof keys === "string" ? [keys] : keys;
        for (const key of keyList) {
          delete storedData[key];
        }
        cb?.();
      },
    },
  },
  runtime: { lastError: undefined as { message: string } | undefined },
};

vi.stubGlobal("chrome", mockChrome);

// ── Import modules under test ────────────────────────────────────────

import { extractBrandFromDocument } from "../src/brand/fetcher";
import { getCachedBrand, setCachedBrand, clearBrandCache } from "../src/brand/cache";
import { isBrandWord, GENERIC_WORDS } from "../src/content/extractor";

// ── Helper: create mock product detail page ──────────────────────────

function createDetailDoc(opts: {
  bylineInfo?: string;
  brandLink?: string;
  poBrand?: string;
  techSpecBrand?: string;
  detailBulletBrand?: string;
} = {}): Document {
  const html: string[] = ["<html><body>"];

  if (opts.bylineInfo) {
    html.push(`<a id="bylineInfo">${opts.bylineInfo}</a>`);
  }

  if (opts.brandLink) {
    html.push(`<a id="brand">${opts.brandLink}</a>`);
  }

  if (opts.poBrand) {
    html.push(`<table><tr class="po-brand"><td>Brand</td><td class="po-break-word">${opts.poBrand}</td></tr></table>`);
  }

  if (opts.techSpecBrand) {
    html.push(`<table id="productDetails_techSpec_section_1"><tr><th>Brand</th><td>${opts.techSpecBrand}</td></tr></table>`);
  }

  if (opts.detailBulletBrand) {
    html.push(`<div id="detailBullets_feature_div"><ul><li><span class="a-list-item">Brand : ${opts.detailBulletBrand}</span></li></ul></div>`);
  }

  html.push("</body></html>");
  const parser = new DOMParser();
  return parser.parseFromString(html.join(""), "text/html");
}

// ── Tests ────────────────────────────────────────────────────────────

describe("extractBrandFromDocument", () => {
  it("extracts brand from 'Visit the X Store' bylineInfo", () => {
    const doc = createDetailDoc({ bylineInfo: "Visit the Sony Store" });
    expect(extractBrandFromDocument(doc)).toBe("Sony");
  });

  it("extracts brand from 'Brand: X' bylineInfo", () => {
    const doc = createDetailDoc({ bylineInfo: "Brand: Anker" });
    expect(extractBrandFromDocument(doc)).toBe("Anker");
  });

  it("extracts brand from a#brand link", () => {
    const doc = createDetailDoc({ brandLink: "Bose" });
    expect(extractBrandFromDocument(doc)).toBe("Bose");
  });

  it("extracts brand from product overview table", () => {
    const doc = createDetailDoc({ poBrand: "JBL" });
    expect(extractBrandFromDocument(doc)).toBe("JBL");
  });

  it("extracts brand from tech specs table", () => {
    const doc = createDetailDoc({ techSpecBrand: "Sennheiser" });
    expect(extractBrandFromDocument(doc)).toBe("Sennheiser");
  });

  it("extracts brand from detail bullets", () => {
    const doc = createDetailDoc({ detailBulletBrand: "Audio-Technica" });
    expect(extractBrandFromDocument(doc)).toBe("Audio-Technica");
  });

  it("prefers bylineInfo over other strategies", () => {
    const doc = createDetailDoc({
      bylineInfo: "Visit the Sony Store",
      brandLink: "SonyDifferent",
      poBrand: "SonyAnother",
    });
    expect(extractBrandFromDocument(doc)).toBe("Sony");
  });

  it("returns null when no brand info found", () => {
    const doc = createDetailDoc();
    expect(extractBrandFromDocument(doc)).toBeNull();
  });
});

describe("Brand cache", () => {
  beforeEach(() => {
    storedData = {};
    mockChrome.runtime.lastError = undefined;
  });

  it("returns null for uncached ASIN", async () => {
    const result = await getCachedBrand("B000000000");
    expect(result).toBeNull();
  });

  it("stores and retrieves a brand", async () => {
    await setCachedBrand("B000000001", "Sony");
    const result = await getCachedBrand("B000000001");
    expect(result).toBe("Sony");
  });

  it("returns null for expired entries", async () => {
    // Manually store an expired entry
    storedData["brand_B000000002"] = {
      brand: "OldBrand",
      cachedAt: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
    };
    const result = await getCachedBrand("B000000002");
    expect(result).toBeNull();
  });

  it("evicts oldest entries when over limit", async () => {
    // Fill index with 1000 fake entries
    const order: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const asin = `B${String(i).padStart(9, "0")}`;
      order.push(asin);
      storedData[`brand_${asin}`] = { brand: `Brand${i}`, cachedAt: Date.now() };
    }
    storedData["brand_cache_index"] = { order };

    // Add one more — should evict the oldest (B000000000)
    await setCachedBrand("BNEW000001", "NewBrand");

    // New entry should be cached
    const newResult = await getCachedBrand("BNEW000001");
    expect(newResult).toBe("NewBrand");

    // Oldest entry should be evicted
    expect(storedData["brand_B000000000"]).toBeUndefined();
  });

  it("clears all brand cache entries", async () => {
    await setCachedBrand("B000000003", "TestBrand");
    await clearBrandCache();
    const result = await getCachedBrand("B000000003");
    expect(result).toBeNull();
  });
});

describe("isBrandWord", () => {
  it("accepts capitalized brand names", () => {
    expect(isBrandWord("Sony")).toBe(true);
    expect(isBrandWord("JBL")).toBe(true);
    expect(isBrandWord("MMWOWARTS")).toBe(true);
  });

  it("rejects generic words", () => {
    expect(isBrandWord("wireless")).toBe(false);
    expect(isBrandWord("Bluetooth")).toBe(false);
    expect(isBrandWord("headphones")).toBe(false);
    expect(isBrandWord("Foldable")).toBe(false);
  });

  it("rejects articles and prepositions", () => {
    expect(isBrandWord("the")).toBe(false);
    expect(isBrandWord("for")).toBe(false);
    expect(isBrandWord("with")).toBe(false);
  });

  it("rejects too-short words", () => {
    expect(isBrandWord("A")).toBe(false);
  });

  it("rejects years", () => {
    expect(isBrandWord("2025")).toBe(false);
    expect(isBrandWord("2026")).toBe(false);
  });

  it("rejects color words", () => {
    expect(isBrandWord("Black")).toBe(false);
    expect(isBrandWord("white")).toBe(false);
    expect(isBrandWord("Pink")).toBe(false);
  });

  it("rejects product categories", () => {
    expect(isBrandWord("Stroller")).toBe(false);
    expect(isBrandWord("Monitor")).toBe(false);
    expect(isBrandWord("Charger")).toBe(false);
    expect(isBrandWord("Squeaky")).toBe(false);
  });

  it("rejects demographics", () => {
    expect(isBrandWord("Baby")).toBe(false);
    expect(isBrandWord("toddler")).toBe(false);
    expect(isBrandWord("Women")).toBe(false);
  });
});

describe("GENERIC_WORDS coverage", () => {
  it("includes all required categories", () => {
    // Articles
    expect(GENERIC_WORDS.has("the")).toBe(true);
    expect(GENERIC_WORDS.has("a")).toBe(true);

    // Adjectives
    expect(GENERIC_WORDS.has("wireless")).toBe(true);
    expect(GENERIC_WORDS.has("waterproof")).toBe(true);
    expect(GENERIC_WORDS.has("ergonomic")).toBe(true);

    // Colors
    expect(GENERIC_WORDS.has("black")).toBe(true);
    expect(GENERIC_WORDS.has("silver")).toBe(true);

    // Product categories
    expect(GENERIC_WORDS.has("headphones")).toBe(true);
    expect(GENERIC_WORDS.has("backpack")).toBe(true);
    expect(GENERIC_WORDS.has("squeaky")).toBe(true);

    // Demographics
    expect(GENERIC_WORDS.has("baby")).toBe(true);
    expect(GENERIC_WORDS.has("toddler")).toBe(true);
    expect(GENERIC_WORDS.has("teen")).toBe(true);
  });
});
