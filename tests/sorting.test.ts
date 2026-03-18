import { describe, it, expect, beforeEach } from "vitest";
import { sortProducts, resetOriginalOrder, computeValueScore, computeTrendScore } from "../src/content/sorting";
import type { Product } from "../src/types";
import type { SortCriteria } from "../src/content/sorting";

function makeProduct(overrides: Partial<Product> = {}): Product {
  const el = document.createElement("div");
  return {
    element: el,
    title: overrides.title ?? "Test Product",
    reviewCount: overrides.reviewCount ?? 100,
    rating: overrides.rating ?? 4.0,
    price: overrides.price ?? 25,
    brand: overrides.brand ?? "TestBrand",
    isSponsored: overrides.isSponsored ?? false,
    asin: overrides.asin ?? "B001",
    ...overrides,
  };
}

describe("Smart Sort", () => {
  let parent: HTMLElement;
  let products: Product[];

  beforeEach(() => {
    resetOriginalOrder();
    parent = document.createElement("div");
    
    products = [
      makeProduct({ title: "Cheap Good", price: 10, rating: 4.5, reviewCount: 500, asin: "A1" }),
      makeProduct({ title: "Expensive Great", price: 100, rating: 4.8, reviewCount: 2000, asin: "A2" }),
      makeProduct({ title: "Mid Range", price: 50, rating: 4.0, reviewCount: 100, asin: "A3" }),
      makeProduct({ title: "Budget Low", price: 5, rating: 3.0, reviewCount: 20, asin: "A4" }),
      makeProduct({ title: "No Price", price: null, rating: 4.2, reviewCount: 300, asin: "A5" }),
    ];
    
    for (const p of products) {
      parent.appendChild(p.element);
    }
  });

  it("sorts by review count descending", () => {
    sortProducts(products, "reviews");
    const order = Array.from(parent.children).map(el =>
      products.find(p => p.element === el)!.title
    );
    expect(order[0]).toBe("Expensive Great"); // 2000
    expect(order[1]).toBe("Cheap Good");      // 500
    expect(order[2]).toBe("No Price");        // 300
  });

  it("sorts by price low to high", () => {
    sortProducts(products, "price-low");
    const order = Array.from(parent.children).map(el =>
      products.find(p => p.element === el)!.title
    );
    expect(order[0]).toBe("Budget Low");  // $5
    expect(order[1]).toBe("Cheap Good");  // $10
    expect(order[4]).toBe("No Price");    // null → Infinity → last
  });

  it("sorts by price high to low", () => {
    sortProducts(products, "price-high");
    const order = Array.from(parent.children).map(el =>
      products.find(p => p.element === el)!.title
    );
    expect(order[0]).toBe("Expensive Great"); // $100
    expect(order[4]).toBe("No Price");         // null → -Infinity → last
  });

  it("sorts by value score", () => {
    sortProducts(products, "value");
    const order = Array.from(parent.children).map(el =>
      products.find(p => p.element === el)!.title
    );
    // Cheap Good: (4.5 * log10(501)) / 10 = high value
    expect(order[0]).toBe("Cheap Good");
  });

  it("sorts by deal score", () => {
    const dealScores = new Map([
      ["A1", 45], ["A2", 80], ["A3", 30], ["A4", 90], ["A5", 60],
    ]);
    sortProducts(products, "deal-score", dealScores);
    const order = Array.from(parent.children).map(el =>
      products.find(p => p.element === el)!.title
    );
    expect(order[0]).toBe("Budget Low");      // 90
    expect(order[1]).toBe("Expensive Great"); // 80
  });

  it("resets to original order with 'default'", () => {
    // Sort first
    sortProducts(products, "reviews");
    // Then reset
    sortProducts(products, "default");
    const order = Array.from(parent.children).map(el =>
      products.find(p => p.element === el)!.title
    );
    expect(order).toEqual([
      "Cheap Good", "Expensive Great", "Mid Range", "Budget Low", "No Price",
    ]);
  });

  it("handles empty product list", () => {
    const result = sortProducts([], "reviews");
    expect(result).toBe(0);
  });

  it("returns count of sorted products", () => {
    const result = sortProducts(products, "reviews");
    expect(result).toBe(5);
  });
});

describe("Score functions", () => {
  it("computeValueScore returns 0 for no-price products", () => {
    const p = makeProduct({ price: null });
    expect(computeValueScore(p)).toBe(0);
  });

  it("computeValueScore returns 0 for zero-price products", () => {
    const p = makeProduct({ price: 0 });
    expect(computeValueScore(p)).toBe(0);
  });

  it("computeValueScore higher for cheap well-reviewed products", () => {
    const cheap = makeProduct({ price: 10, rating: 4.5, reviewCount: 500 });
    const expensive = makeProduct({ price: 100, rating: 4.5, reviewCount: 500 });
    expect(computeValueScore(cheap)).toBeGreaterThan(computeValueScore(expensive));
  });

  it("computeTrendScore higher for popular products", () => {
    const popular = makeProduct({ rating: 4.5, reviewCount: 2000 });
    const niche = makeProduct({ rating: 4.5, reviewCount: 20 });
    expect(computeTrendScore(popular)).toBeGreaterThan(computeTrendScore(niche));
  });
});
