/**
 * Selector Breakage Detection Tests
 *
 * These tests verify that our Amazon DOM selectors still work against
 * saved HTML snapshots. When Amazon changes their HTML structure, these
 * tests fail FIRST — before users notice.
 *
 * To update snapshots: save a fresh Amazon search results page as HTML
 * and place it in example_pages/.
 *
 * Run: npx vitest run tests/selectorBreakage.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.stubGlobal("chrome", {
  storage: {
    sync: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    local: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined },
});

import { $, $$, SEARCH, REVIEW, LISTING, getFallbackStats, resetFallbackStats } from "../src/selectors";

function loadSnapshot(filename: string): Document {
  const html = readFileSync(join(__dirname, "..", "example_pages", filename), "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

// ── Search Page Selector Tests ──────────────────────────────────────

describe("search page selectors (headphones.html)", () => {
  let doc: Document;

  try {
    // Only run if snapshot exists
    const html = readFileSync(join(__dirname, "..", "example_pages", "headphones.html"), "utf-8");
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    // Skip tests if snapshot doesn't exist
    it.skip("snapshot not available", () => {});
    return;
  }

  it("finds product cards", () => {
    const cards = $$(doc, ...SEARCH.productCard);
    expect(cards.length).toBeGreaterThan(0);
    console.log(`Found ${cards.length} product cards`);
  });

  it("finds product titles within cards", () => {
    const cards = $$(doc, ...SEARCH.productCard);
    if (cards.length === 0) return;
    const title = $(cards[0], ...SEARCH.titleText);
    expect(title).not.toBeNull();
    expect(title?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("finds prices within cards", () => {
    const cards = $$(doc, ...SEARCH.productCard);
    let priceFound = false;
    for (const card of cards.slice(0, 10)) {
      const price = $(card, ...SEARCH.price);
      if (price) { priceFound = true; break; }
    }
    expect(priceFound).toBe(true);
  });

  it("finds ratings within cards", () => {
    const cards = $$(doc, ...SEARCH.productCard);
    let ratingFound = false;
    for (const card of cards.slice(0, 10)) {
      const rating = $(card, ...SEARCH.rating);
      if (rating) { ratingFound = true; break; }
    }
    expect(ratingFound).toBe(true);
  });

  it("finds product links with ASINs", () => {
    const cards = $$(doc, ...SEARCH.productCard);
    let asinFound = false;
    for (const card of cards.slice(0, 10)) {
      const link = $(card, ...SEARCH.productLink) as HTMLAnchorElement | null;
      if (link?.href?.includes("/dp/")) { asinFound = true; break; }
    }
    expect(asinFound).toBe(true);
  });
});

describe("search page selectors (baby.html)", () => {
  let doc: Document;

  try {
    const html = readFileSync(join(__dirname, "..", "example_pages", "baby.html"), "utf-8");
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    it.skip("snapshot not available", () => {});
    return;
  }

  it("finds product cards in baby category", () => {
    const cards = $$(doc, ...SEARCH.productCard);
    expect(cards.length).toBeGreaterThan(0);
  });
});

describe("search page selectors (clothes.html)", () => {
  let doc: Document;

  try {
    const html = readFileSync(join(__dirname, "..", "example_pages", "clothes.html"), "utf-8");
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    it.skip("snapshot not available", () => {});
    return;
  }

  it("finds product cards in clothing category", () => {
    const cards = $$(doc, ...SEARCH.productCard);
    expect(cards.length).toBeGreaterThan(0);
  });
});

// ── Selector Registry Completeness ──────────────────────────────────

describe("selector registry completeness", () => {
  it("SEARCH has all required selector groups", () => {
    expect(SEARCH.productCard.length).toBeGreaterThanOrEqual(1);
    expect(SEARCH.titleText.length).toBeGreaterThanOrEqual(1);
    expect(SEARCH.rating.length).toBeGreaterThanOrEqual(1);
    expect(SEARCH.price.length).toBeGreaterThanOrEqual(1);
    expect(SEARCH.sponsored.length).toBeGreaterThanOrEqual(1);
    expect(SEARCH.productLink.length).toBeGreaterThanOrEqual(1);
  });

  it("REVIEW has all required selector groups", () => {
    expect(REVIEW.histogram.length).toBeGreaterThanOrEqual(1);
    expect(REVIEW.reviewContainer.length).toBeGreaterThanOrEqual(1);
    expect(REVIEW.reviewRating.length).toBeGreaterThanOrEqual(1);
    expect(REVIEW.reviewBody.length).toBeGreaterThanOrEqual(1);
    expect(REVIEW.totalRatings.length).toBeGreaterThanOrEqual(1);
  });

  it("LISTING has all required selector groups", () => {
    expect(LISTING.detailTables.length).toBeGreaterThanOrEqual(1);
    expect(LISTING.description.length).toBeGreaterThanOrEqual(1);
    expect(LISTING.images.length).toBeGreaterThanOrEqual(1);
    expect(LISTING.bulletPoints.length).toBeGreaterThanOrEqual(1);
  });

  it("all selectors are valid CSS", () => {
    const allGroups = [SEARCH, REVIEW, LISTING];
    for (const group of allGroups) {
      for (const [key, selectors] of Object.entries(group)) {
        for (const sel of selectors as string[]) {
          expect(() => {
            document.querySelector(sel);
          }).not.toThrow();
        }
      }
    }
  });
});

// ── Fallback Tracking Tests ─────────────────────────────────────────

describe("fallback tracking", () => {
  beforeEach(() => {
    resetFallbackStats();
    document.body.innerHTML = "";
  });

  it("does not track when primary selector matches", () => {
    document.body.innerHTML = '<div class="primary">content</div>';
    $$(document, ".primary", ".fallback");
    const stats = getFallbackStats();
    expect(stats.length).toBe(0);
  });

  it("tracks when fallback selector is used", () => {
    document.body.innerHTML = '<div class="fallback">content</div>';
    $$(document, ".primary-missing", ".fallback");
    const stats = getFallbackStats();
    expect(stats.length).toBe(1);
    expect(stats[0].matchedIndex).toBe(1);
    expect(stats[0].count).toBe(1);
  });

  it("counts repeated fallback usage", () => {
    document.body.innerHTML = '<div class="fb">a</div>';
    $(document, ".missing", ".fb");
    $(document, ".missing", ".fb");
    $(document, ".missing", ".fb");
    const stats = getFallbackStats();
    expect(stats[0].count).toBe(3);
  });

  it("tracks different fallback depths", () => {
    document.body.innerHTML = '<div class="third">x</div>';
    $(document, ".first-missing", ".second-missing", ".third");
    const stats = getFallbackStats();
    expect(stats[0].matchedIndex).toBe(2);
  });

  it("resets stats correctly", () => {
    document.body.innerHTML = '<div class="fb">a</div>';
    $(document, ".missing", ".fb");
    expect(getFallbackStats().length).toBe(1);
    resetFallbackStats();
    expect(getFallbackStats().length).toBe(0);
  });
});
