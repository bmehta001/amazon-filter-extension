import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderCompareTray, destroyCompareTray } from "../src/content/ui/compareTray";
import type { CompareItem } from "../src/compare/storage";

// Mock removeFromCompare and clearCompare
vi.mock("../src/compare/storage", () => ({
  removeFromCompare: vi.fn(),
  clearCompare: vi.fn(),
}));

function makeItem(overrides: Partial<CompareItem> = {}): CompareItem {
  return {
    asin: "B000TEST01",
    title: "Test Wireless Headphones",
    brand: "TestBrand",
    price: 29.99,
    rating: 4.5,
    reviewCount: 100,
    url: "https://www.amazon.com/dp/B000TEST01",
    pinnedAt: Date.now(),
    searchQuery: "headphones",
    ...overrides,
  };
}

beforeEach(() => {
  destroyCompareTray();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("renderCompareTray", () => {
  it("creates the tray element in the DOM", () => {
    renderCompareTray([makeItem()]);
    const tray = document.querySelector(".bas-compare-tray");
    expect(tray).toBeTruthy();
  });

  it("shows item count badge", () => {
    renderCompareTray([makeItem({ asin: "B001" }), makeItem({ asin: "B002" })]);
    const count = document.querySelector(".bas-compare-bar__count");
    expect(count?.textContent).toBe("2");
  });

  it("renders product chips", () => {
    renderCompareTray([makeItem({ asin: "B001", title: "Alpha" }), makeItem({ asin: "B002", title: "Beta" })]);
    const chips = document.querySelectorAll(".bas-compare-chip");
    expect(chips).toHaveLength(2);
  });

  it("hides tray when items is empty", () => {
    renderCompareTray([makeItem()]);
    renderCompareTray([]);
    const tray = document.querySelector(".bas-compare-tray");
    expect(tray?.classList.contains("bas-compare-tray--hidden")).toBe(true);
  });

  it("shows Compare button only when >= 2 items", () => {
    renderCompareTray([makeItem()]);
    const primaryBtn = document.querySelector(".bas-compare-btn--primary");
    expect(primaryBtn).toBeNull();

    renderCompareTray([makeItem({ asin: "B001" }), makeItem({ asin: "B002" })]);
    const primaryBtn2 = document.querySelector(".bas-compare-btn--primary");
    expect(primaryBtn2).toBeTruthy();
    expect(primaryBtn2?.textContent).toContain("Compare");
  });

  it("expands comparison table on click", () => {
    renderCompareTray([makeItem({ asin: "B001" }), makeItem({ asin: "B002" })]);
    const expandBtn = document.querySelector(".bas-compare-btn--primary") as HTMLButtonElement;
    expandBtn.click();
    const panel = document.querySelector(".bas-compare-panel");
    expect(panel?.classList.contains("bas-compare-panel--open")).toBe(true);
  });

  it("builds comparison table with correct rows", () => {
    renderCompareTray([
      makeItem({ asin: "B001", price: 19.99, rating: 4.0 }),
      makeItem({ asin: "B002", price: 39.99, rating: 4.8 }),
    ]);
    // Expand the panel
    const expandBtn = document.querySelector(".bas-compare-btn--primary") as HTMLButtonElement;
    expandBtn.click();
    
    const table = document.querySelector(".bas-compare-table");
    expect(table).toBeTruthy();
    const headers = table!.querySelectorAll("th");
    const headerTexts = Array.from(headers).map((h) => h.textContent);
    expect(headerTexts).toContain("Title");
    expect(headerTexts).toContain("Price");
    expect(headerTexts).toContain("Rating");
    expect(headerTexts).toContain("Reviews");
  });

  it("highlights best/worst values", () => {
    renderCompareTray([
      makeItem({ asin: "B001", price: 19.99, rating: 3.5 }),
      makeItem({ asin: "B002", price: 49.99, rating: 4.9 }),
    ]);
    const expandBtn = document.querySelector(".bas-compare-btn--primary") as HTMLButtonElement;
    expandBtn.click();

    const bestCells = document.querySelectorAll(".bas-best");
    const worstCells = document.querySelectorAll(".bas-worst");
    expect(bestCells.length).toBeGreaterThan(0);
    expect(worstCells.length).toBeGreaterThan(0);
  });

  it("injects styles into document head", () => {
    renderCompareTray([makeItem()]);
    const style = document.getElementById("bas-compare-styles");
    expect(style).toBeTruthy();
    expect(style?.textContent).toContain(".bas-compare-tray");
  });

  it("has Clear button", () => {
    renderCompareTray([makeItem()]);
    const clearBtn = Array.from(document.querySelectorAll(".bas-compare-btn"))
      .find((b) => b.textContent === "Clear");
    expect(clearBtn).toBeTruthy();
  });

  it("has remove buttons on chips", () => {
    renderCompareTray([makeItem()]);
    const removeX = document.querySelector(".bas-compare-chip__remove");
    expect(removeX).toBeTruthy();
    expect(removeX?.textContent).toBe("✕");
  });
});

describe("destroyCompareTray", () => {
  it("removes the tray from DOM", () => {
    renderCompareTray([makeItem()]);
    expect(document.querySelector(".bas-compare-tray")).toBeTruthy();
    destroyCompareTray();
    expect(document.querySelector(".bas-compare-tray")).toBeNull();
  });

  it("is safe to call when no tray exists", () => {
    expect(() => destroyCompareTray()).not.toThrow();
  });
});
