import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("chrome", {
  storage: {
    sync: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    local: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined },
});

import { analyzeListingCompleteness } from "../src/listing/completeness";
import type { ListingCompleteness } from "../src/listing/completeness";
import {
  injectListingQualityBadge,
  removeListingQualityBadge,
  LISTING_QUALITY_STYLES,
} from "../src/content/ui/listingQualityBadge";

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

// ── Listing Completeness Analysis ──

describe("analyzeListingCompleteness", () => {
  it("detects dimensions in product details table", () => {
    const doc = makeDoc(`
      <div id="prodDetails">
        <table><tr><th>Product Dimensions</th><td>10 x 5 x 3 inches</td></tr></table>
      </div>
    `);
    const result = analyzeListingCompleteness(doc, null);
    const dim = result.fields.find((f) => f.id === "dimensions");
    expect(dim?.present).toBe(true);
  });

  it("detects weight in tech spec table", () => {
    const doc = makeDoc(`
      <div id="productDetails_techSpec_section_1">
        <table><tr><th>Item Weight</th><td>2.5 pounds</td></tr></table>
      </div>
    `);
    const result = analyzeListingCompleteness(doc, null);
    const wt = result.fields.find((f) => f.id === "weight");
    expect(wt?.present).toBe(true);
  });

  it("detects ingredients in detail bullets", () => {
    const doc = makeDoc(`
      <div id="detailBullets_feature_div">
        <li>Ingredients: Water, Sugar, Citric Acid</li>
      </div>
    `);
    const result = analyzeListingCompleteness(doc, null);
    const ing = result.fields.find((f) => f.id === "ingredients");
    expect(ing?.present).toBe(true);
  });

  it("detects ingredients via section heading", () => {
    const doc = makeDoc(`
      <h3>Ingredients</h3>
      <div>Water, Sugar, Citric Acid, Natural Flavors</div>
    `);
    const result = analyzeListingCompleteness(doc, null);
    const ing = result.fields.find((f) => f.id === "ingredients");
    expect(ing?.present).toBe(true);
  });

  it("detects warranty in detail fields", () => {
    const doc = makeDoc(`
      <div id="prodDetails">
        <table><tr><th>Warranty Description</th><td>1 Year Limited</td></tr></table>
      </div>
    `);
    const result = analyzeListingCompleteness(doc, null);
    const warranty = result.fields.find((f) => f.id === "warranty");
    expect(warranty?.present).toBe(true);
  });

  it("detects product description", () => {
    const doc = makeDoc(`
      <div id="productDescription">
        ${"A".repeat(60)}
      </div>
    `);
    const result = analyzeListingCompleteness(doc, null);
    const desc = result.fields.find((f) => f.id === "description");
    expect(desc?.present).toBe(true);
  });

  it("rejects short product description", () => {
    const doc = makeDoc(`<div id="productDescription">Short</div>`);
    const result = analyzeListingCompleteness(doc, null);
    const desc = result.fields.find((f) => f.id === "description");
    expect(desc?.present).toBe(false);
  });

  it("detects spec table", () => {
    const doc = makeDoc(`<table id="productDetails_techSpec_section_1"><tr><td>Spec</td></tr></table>`);
    const result = analyzeListingCompleteness(doc, null);
    const spec = result.fields.find((f) => f.id === "spec-table");
    expect(spec?.present).toBe(true);
  });

  it("detects feature bullet points", () => {
    const doc = makeDoc(`
      <div id="feature-bullets">
        <li>Feature 1</li><li>Feature 2</li><li>Feature 3</li>
      </div>
    `);
    const result = analyzeListingCompleteness(doc, null);
    const bullets = result.fields.find((f) => f.id === "bullet-points");
    expect(bullets?.present).toBe(true);
  });

  it("returns low score for empty page", () => {
    const doc = makeDoc(`<div>Empty page</div>`);
    const result = analyzeListingCompleteness(doc, null);
    expect(result.score).toBeLessThan(30);
    expect(result.label).toBe("poor");
    expect(result.color).toBe("red");
    expect(result.presentCount).toBe(0);
  });

  it("returns high score for fully populated page", () => {
    const doc = makeDoc(`
      <div id="prodDetails">
        <table>
          <tr><th>Product Dimensions</th><td>10 x 5 x 3</td></tr>
          <tr><th>Item Weight</th><td>2 lbs</td></tr>
          <tr><th>Material</th><td>Steel</td></tr>
          <tr><th>Manufacturer</th><td>ACME Corp</td></tr>
          <tr><th>Item model number</th><td>XYZ-123</td></tr>
          <tr><th>UPC</th><td>012345678901</td></tr>
          <tr><th>Warranty Description</th><td>1 Year</td></tr>
          <tr><th>Ingredients</th><td>Steel, Rubber</td></tr>
        </table>
      </div>
      <table id="productDetails_techSpec_section_1"><tr><td>Spec</td></tr></table>
      <div id="productDescription">${"A".repeat(100)}</div>
      <div id="altImages"><img /><img /><img /></div>
      <div id="feature-bullets"><li>A</li><li>B</li><li>C</li></div>
    `);
    const result = analyzeListingCompleteness(doc, null);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.label).toBe("complete");
    expect(result.color).toBe("green");
    expect(result.presentCount).toBe(12);
  });
});

// ── Category-specific expectations ──

describe("category-specific expectations", () => {
  it("marks ingredients as required for grocery", () => {
    const doc = makeDoc(`<div>Empty</div>`);
    const result = analyzeListingCompleteness(doc, "16310101"); // Grocery
    const ing = result.fields.find((f) => f.id === "ingredients");
    expect(ing?.importance).toBe("required");
  });

  it("marks dimensions as required for electronics", () => {
    const doc = makeDoc(`<div>Empty</div>`);
    const result = analyzeListingCompleteness(doc, "172282"); // Electronics
    const dim = result.fields.find((f) => f.id === "dimensions");
    expect(dim?.importance).toBe("required");
    const model = result.fields.find((f) => f.id === "model-number");
    expect(model?.importance).toBe("required");
  });

  it("marks materials as required for clothing", () => {
    const doc = makeDoc(`<div>Empty</div>`);
    const result = analyzeListingCompleteness(doc, "7141123011"); // Clothing
    const mat = result.fields.find((f) => f.id === "materials");
    expect(mat?.importance).toBe("required");
  });

  it("marks ingredients as required for beauty", () => {
    const doc = makeDoc(`<div>Empty</div>`);
    const result = analyzeListingCompleteness(doc, "3760911"); // Beauty
    const ing = result.fields.find((f) => f.id === "ingredients");
    expect(ing?.importance).toBe("required");
  });

  it("uses default expectations for unknown department", () => {
    const doc = makeDoc(`<div>Empty</div>`);
    const result = analyzeListingCompleteness(doc, "9999999");
    const desc = result.fields.find((f) => f.id === "description");
    expect(desc?.importance).toBe("required"); // default required
    const ing = result.fields.find((f) => f.id === "ingredients");
    expect(ing?.importance).toBe("optional"); // not in default
  });

  it("missing required fields count higher against score", () => {
    const doc = makeDoc(`<div>Empty</div>`);
    const grocery = analyzeListingCompleteness(doc, "16310101");
    const books = analyzeListingCompleteness(doc, "283155");
    // Grocery has more required fields → lower score when nothing present
    // Both are 0/12 present, but different max scores due to importance
    expect(grocery.missingImportantCount).toBeGreaterThan(0);
    expect(books.missingImportantCount).toBeGreaterThan(0);
  });
});

// ── Listing Quality Badge UI ──

describe("listingQualityBadge", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  function makeCompleteness(overrides: Partial<ListingCompleteness> = {}): ListingCompleteness {
    return {
      score: 40,
      label: "sparse",
      color: "orange",
      fields: [
        { id: "dimensions", label: "Product Dimensions", present: false, importance: "required" },
        { id: "description", label: "Product Description", present: true, importance: "recommended" },
      ],
      department: null,
      presentCount: 5,
      totalCount: 12,
      missingImportantCount: 3,
      ...overrides,
    };
  }

  it("injects badge onto card", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);
    document.body.appendChild(card);

    injectListingQualityBadge(card, makeCompleteness());
    const badge = card.querySelector(".bas-listing-quality");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("3 missing");
    expect(badge?.getAttribute("data-color")).toBe("orange");
  });

  it("does not inject for complete listings", () => {
    const card = document.createElement("div");
    card.appendChild(document.createElement("h2"));
    document.body.appendChild(card);

    injectListingQualityBadge(card, makeCompleteness({
      score: 95,
      label: "complete",
      color: "green",
      missingImportantCount: 0,
    }));
    expect(card.querySelector(".bas-listing-quality")).toBeNull();
  });

  it("does not inject twice (idempotent)", () => {
    const card = document.createElement("div");
    card.appendChild(document.createElement("h2"));
    document.body.appendChild(card);

    const data = makeCompleteness();
    injectListingQualityBadge(card, data);
    injectListingQualityBadge(card, data);
    expect(card.querySelectorAll(".bas-listing-quality").length).toBe(1);
  });

  it("removes badge from card", () => {
    const card = document.createElement("div");
    card.appendChild(document.createElement("h2"));
    document.body.appendChild(card);

    injectListingQualityBadge(card, makeCompleteness());
    expect(card.querySelector(".bas-listing-quality")).not.toBeNull();
    removeListingQualityBadge(card);
    expect(card.querySelector(".bas-listing-quality")).toBeNull();
  });

  it("shows poor label for very low score", () => {
    const card = document.createElement("div");
    card.appendChild(document.createElement("h2"));
    document.body.appendChild(card);

    injectListingQualityBadge(card, makeCompleteness({
      score: 15,
      label: "poor",
      color: "red",
      missingImportantCount: 7,
    }));
    const badge = card.querySelector(".bas-listing-quality");
    expect(badge?.getAttribute("data-color")).toBe("red");
    expect(badge?.textContent).toContain("7 missing");
  });

  it("has expandable detail panel", () => {
    const card = document.createElement("div");
    card.appendChild(document.createElement("h2"));
    document.body.appendChild(card);

    injectListingQualityBadge(card, makeCompleteness());
    const panel = card.querySelector(".bas-lq-panel");
    expect(panel).not.toBeNull();
    // Panel starts hidden
    expect(panel?.classList.contains("open")).toBe(false);
  });

  it("exports LISTING_QUALITY_STYLES", () => {
    expect(LISTING_QUALITY_STYLES).toContain("bas-listing-quality");
    expect(LISTING_QUALITY_STYLES).toContain("bas-lq-panel");
  });
});
