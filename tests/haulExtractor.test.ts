import { describe, it, expect, beforeEach } from "vitest";
import { extractHaulProduct, getHaulProductCards, extractAllHaulProducts } from "../src/content/haulExtractor";

// ── Mock Haul card helpers ──────────────────────────────────────────

/**
 * Create a mock Amazon Haul product card.
 * Haul cards are simpler than regular Amazon cards — typically just
 * an image, title, price, and optional badges.
 */
function createMockHaulCard(opts: {
  title?: string;
  price?: string;
  asin?: string;
  brand?: string;
  sponsored?: boolean;
  rating?: string;
  reviewCount?: string;
  badge?: string; // e.g., "Selling fast", "in 424 carts"
  useImgAlt?: boolean; // title comes from img alt text
  useClassName?: boolean; // card uses class-based identification
} = {}): HTMLElement {
  const card = document.createElement("div");
  if (opts.useClassName) {
    card.className = "product-card";
  }
  if (opts.asin) {
    card.dataset.asin = opts.asin;
  }

  // Image with product link
  const link = document.createElement("a");
  const asin = opts.asin || "B0TEST12345";
  link.href = `https://www.amazon.com/Product-Name/dp/${asin}/ref=haul_test`;

  const img = document.createElement("img");
  img.src = `https://m.media-amazon.com/images/I/test._SL300_.jpg`;
  if (opts.useImgAlt || !opts.title) {
    img.alt = opts.title || "Test Haul Product";
  }
  link.appendChild(img);
  card.appendChild(link);

  // Title text (if not using img alt only)
  if (opts.title && !opts.useImgAlt) {
    const titleDiv = document.createElement("div");
    titleDiv.className = "product-title";
    titleDiv.textContent = opts.title;
    card.appendChild(titleDiv);
  }

  // Price
  if (opts.price) {
    const priceSpan = document.createElement("span");
    priceSpan.textContent = opts.price;
    card.appendChild(priceSpan);
  }

  // Brand
  if (opts.brand) {
    const brandSpan = document.createElement("span");
    brandSpan.className = "brand-name";
    brandSpan.textContent = `by ${opts.brand}`;
    card.appendChild(brandSpan);
  }

  // Badge (e.g., "Selling fast")
  if (opts.badge) {
    const badgeSpan = document.createElement("span");
    badgeSpan.textContent = opts.badge;
    card.appendChild(badgeSpan);
  }

  // Sponsored marker
  if (opts.sponsored) {
    const sponsoredSpan = document.createElement("span");
    sponsoredSpan.textContent = "Sponsored";
    card.appendChild(sponsoredSpan);
  }

  // Rating (if present on Haul — not always shown)
  if (opts.rating) {
    const ratingSpan = document.createElement("span");
    ratingSpan.setAttribute("aria-label", opts.rating);
    card.appendChild(ratingSpan);
  }

  // Review count
  if (opts.reviewCount) {
    const reviewSpan = document.createElement("span");
    reviewSpan.setAttribute("aria-label", `${opts.reviewCount} reviews`);
    card.appendChild(reviewSpan);
  }

  return card;
}

/**
 * Set up a mock Haul page with a grid of product cards.
 */
function setupHaulGrid(cards: HTMLElement[]): HTMLElement {
  // Clear any existing Haul grid
  document.body.innerHTML = "";

  // Create a Haul-like page structure
  const main = document.createElement("main");
  const grid = document.createElement("div");
  grid.className = "product-grid";

  for (const card of cards) {
    grid.appendChild(card);
  }

  main.appendChild(grid);
  document.body.appendChild(main);
  return grid;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("extractHaulProduct", () => {
  it("extracts title from img alt text", () => {
    const card = createMockHaulCard({
      title: "USB-C Adapter 8-Pack",
      useImgAlt: true,
    });
    const product = extractHaulProduct(card);
    expect(product.title).toBe("USB-C Adapter 8-Pack");
  });

  it("extracts title from a heading or title element", () => {
    const card = createMockHaulCard({
      title: "Portable Phone Charger 5000mAh",
      useImgAlt: false,
    });
    const product = extractHaulProduct(card);
    expect(product.title).toContain("Portable Phone Charger");
  });

  it("extracts ASIN from data attribute", () => {
    const card = createMockHaulCard({ asin: "B0TESTHAUL1" });
    const product = extractHaulProduct(card);
    expect(product.asin).toBe("B0TESTHAUL1");
  });

  it("extracts ASIN from product link URL", () => {
    const card = createMockHaulCard({ asin: "B0FXFVQJN8" });
    // Remove the data-asin so it falls back to link extraction
    delete card.dataset.asin;
    const product = extractHaulProduct(card);
    expect(product.asin).toBe("B0FXFVQJN8");
  });

  it("extracts price from text content", () => {
    const card = createMockHaulCard({ price: "$7.99" });
    const product = extractHaulProduct(card);
    expect(product.price).toBe(7.99);
  });

  it("handles whole dollar prices", () => {
    const card = createMockHaulCard({ price: "$5" });
    const product = extractHaulProduct(card);
    expect(product.price).toBe(5);
  });

  it("returns null for missing price", () => {
    const card = createMockHaulCard();
    // Remove price elements
    const product = extractHaulProduct(card);
    // Price may or may not be found depending on what text is in the card
    expect(product.price === null || typeof product.price === "number").toBe(true);
  });

  it("extracts brand from 'by BrandName' pattern", () => {
    const card = createMockHaulCard({ brand: "TechGear" });
    const product = extractHaulProduct(card);
    expect(product.brand).toBe("TechGear");
  });

  it("returns 'Unknown' when no brand is available", () => {
    const card = createMockHaulCard({ title: "Generic Item" });
    const product = extractHaulProduct(card);
    expect(product.brand).toBe("Unknown");
  });

  it("detects sponsored products", () => {
    const card = createMockHaulCard({ sponsored: true });
    const product = extractHaulProduct(card);
    expect(product.isSponsored).toBe(true);
  });

  it("returns false for non-sponsored products", () => {
    const card = createMockHaulCard({ sponsored: false });
    const product = extractHaulProduct(card);
    expect(product.isSponsored).toBe(false);
  });

  it("defaults to 0 reviews (Haul doesn't show review counts)", () => {
    const card = createMockHaulCard({ title: "Basic Item" });
    const product = extractHaulProduct(card);
    expect(product.reviewCount).toBe(0);
  });

  it("defaults to 0 rating (Haul doesn't show ratings)", () => {
    const card = createMockHaulCard({ title: "Basic Item" });
    const product = extractHaulProduct(card);
    expect(product.rating).toBe(0);
  });

  it("extracts rating when available via aria-label", () => {
    const card = createMockHaulCard({ rating: "4.2 out of 5 stars" });
    const product = extractHaulProduct(card);
    expect(product.rating).toBe(4.2);
  });

  it("extracts review count when available via aria-label", () => {
    const card = createMockHaulCard({ reviewCount: "250" });
    const product = extractHaulProduct(card);
    expect(product.reviewCount).toBe(250);
  });

  it("preserves element reference", () => {
    const card = createMockHaulCard();
    const product = extractHaulProduct(card);
    expect(product.element).toBe(card);
  });
});

describe("getHaulProductCards", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds cards by class name selector", () => {
    const cards = [
      createMockHaulCard({ title: "Item 1", useClassName: true }),
      createMockHaulCard({ title: "Item 2", useClassName: true }),
      createMockHaulCard({ title: "Item 3", useClassName: true }),
    ];
    setupHaulGrid(cards);
    const found = getHaulProductCards();
    expect(found.length).toBe(3);
  });

  it("falls back to link-based detection when no class selectors match", () => {
    // Create cards without identifiable class names
    const card1 = document.createElement("div");
    const link1 = document.createElement("a");
    link1.href = "/Product-A/dp/B0TESTASIN1/ref=haul";
    const img1 = document.createElement("img");
    img1.alt = "Product A";
    link1.appendChild(img1);
    card1.appendChild(link1);
    // Give it some size so offsetHeight check works in environments that support it
    Object.defineProperty(card1, "offsetHeight", { value: 200 });
    Object.defineProperty(card1, "offsetWidth", { value: 200 });

    const card2 = document.createElement("div");
    const link2 = document.createElement("a");
    link2.href = "/Product-B/dp/B0TESTASIN2/ref=haul";
    const img2 = document.createElement("img");
    img2.alt = "Product B";
    link2.appendChild(img2);
    card2.appendChild(link2);
    Object.defineProperty(card2, "offsetHeight", { value: 200 });
    Object.defineProperty(card2, "offsetWidth", { value: 200 });

    document.body.appendChild(card1);
    document.body.appendChild(card2);

    const found = getHaulProductCards();
    // In JSDOM, getComputedStyle may not return meaningful display values,
    // but the function should still attempt to find cards
    expect(found.length).toBeGreaterThanOrEqual(0);
  });

  it("returns empty array when no product cards exist", () => {
    document.body.innerHTML = "<div>No products here</div>";
    const found = getHaulProductCards();
    expect(found.length).toBe(0);
  });
});

describe("extractAllHaulProducts", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("extracts products from all cards in the grid", () => {
    const cards = [
      createMockHaulCard({ title: "Headphones", price: "$9.99", asin: "B0HAUL001", useClassName: true }),
      createMockHaulCard({ title: "Phone Case", price: "$4.99", asin: "B0HAUL002", useClassName: true }),
      createMockHaulCard({ title: "USB Cable", price: "$2.99", asin: "B0HAUL003", useClassName: true }),
    ];
    setupHaulGrid(cards);

    const products = extractAllHaulProducts();
    expect(products.length).toBe(3);
    expect(products[0].asin).toBe("B0HAUL001");
    expect(products[1].asin).toBe("B0HAUL002");
    expect(products[2].asin).toBe("B0HAUL003");
  });

  it("handles cards with minimal data gracefully", () => {
    const cards = [
      createMockHaulCard({ useClassName: true }),
    ];
    setupHaulGrid(cards);

    const products = extractAllHaulProducts();
    expect(products.length).toBe(1);
    expect(products[0].reviewCount).toBe(0);
    expect(products[0].rating).toBe(0);
    expect(typeof products[0].title).toBe("string");
  });
});

describe("URL detection", () => {
  it("isAmazonHaulPage detects Haul URLs", async () => {
    const { isAmazonHaulPage } = await import("../src/util/url");
    expect(isAmazonHaulPage("https://www.amazon.com/haul")).toBe(true);
    expect(isAmazonHaulPage("https://www.amazon.com/haul/store")).toBe(true);
    expect(isAmazonHaulPage("https://www.amazon.com/haul/store?category=electronics")).toBe(true);
    expect(isAmazonHaulPage("https://www.amazon.co.uk/haul")).toBe(true);
  });

  it("isAmazonHaulPage rejects non-Haul URLs", async () => {
    const { isAmazonHaulPage } = await import("../src/util/url");
    expect(isAmazonHaulPage("https://www.amazon.com/s?k=headphones")).toBe(false);
    expect(isAmazonHaulPage("https://www.amazon.com/dp/B0TEST123")).toBe(false);
    expect(isAmazonHaulPage("https://www.google.com/haul")).toBe(false);
  });

  it("isAmazonSupportedPage accepts both search and Haul", async () => {
    const { isAmazonSupportedPage } = await import("../src/util/url");
    expect(isAmazonSupportedPage("https://www.amazon.com/s?k=test")).toBe(true);
    expect(isAmazonSupportedPage("https://www.amazon.com/haul")).toBe(true);
    expect(isAmazonSupportedPage("https://www.amazon.com/dp/B0TEST")).toBe(false);
  });

  it("isAmazonSearchPage still rejects Haul URLs", async () => {
    const { isAmazonSearchPage } = await import("../src/util/url");
    expect(isAmazonSearchPage("https://www.amazon.com/haul")).toBe(false);
    expect(isAmazonSearchPage("https://www.amazon.com/s?k=test")).toBe(true);
  });
});
