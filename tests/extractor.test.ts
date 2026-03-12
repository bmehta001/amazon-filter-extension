import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";

// This test file validates the extractor against mock Amazon DOM structures.
// Since the extractor depends on real DOM, we construct mock card elements.

// We import directly after setting up a mock document
import { extractProduct } from "../src/content/extractor";

/**
 * Create a mock Amazon product card element.
 */
function createMockCard(opts: {
  title?: string;
  reviewCount?: string;
  rating?: string;
  price?: string;
  brand?: string;
  sponsored?: boolean;
  asin?: string;
} = {}): HTMLElement {
  const card = document.createElement("div");
  card.setAttribute("data-component-type", "s-search-result");
  if (opts.asin) card.dataset.asin = opts.asin;

  // Title
  const h2 = document.createElement("h2");
  const link = document.createElement("a");
  link.className = "a-link-normal";
  link.href = opts.asin ? `/dp/${opts.asin}` : "/dp/B000000000";
  const span = document.createElement("span");
  span.textContent = opts.title || "Test Product";
  link.appendChild(span);
  h2.appendChild(link);
  card.appendChild(h2);

  // Review count
  if (opts.reviewCount) {
    const reviewSpan = document.createElement("span");
    reviewSpan.className = "a-size-base s-underline-text";
    reviewSpan.textContent = opts.reviewCount;
    card.appendChild(reviewSpan);
  }

  // Rating
  if (opts.rating) {
    const ratingI = document.createElement("i");
    ratingI.className = "a-icon-star-small";
    const ratingSpan = document.createElement("span");
    ratingSpan.className = "a-icon-alt";
    ratingSpan.textContent = opts.rating;
    ratingI.appendChild(ratingSpan);
    card.appendChild(ratingI);
  }

  // Price
  if (opts.price) {
    const priceSpan = document.createElement("span");
    priceSpan.className = "a-price";
    const offscreen = document.createElement("span");
    offscreen.className = "a-offscreen";
    offscreen.textContent = opts.price;
    priceSpan.appendChild(offscreen);
    card.appendChild(priceSpan);
  }

  // Brand
  if (opts.brand) {
    const brandSpan = document.createElement("span");
    brandSpan.className = "a-size-base-plus a-color-base";
    brandSpan.textContent = opts.brand;
    card.appendChild(brandSpan);
  }

  // Sponsored
  if (opts.sponsored) {
    const sponsoredSpan = document.createElement("span");
    sponsoredSpan.className = "a-color-secondary";
    sponsoredSpan.textContent = "Sponsored";
    card.appendChild(sponsoredSpan);
  }

  return card;
}

describe("extractProduct", () => {
  it("extracts title from h2 > a > span", () => {
    const card = createMockCard({ title: "Wireless Headphones" });
    const product = extractProduct(card);
    expect(product.title).toBe("Wireless Headphones");
  });

  it("extracts review count", () => {
    const card = createMockCard({ reviewCount: "1,234" });
    const product = extractProduct(card);
    expect(product.reviewCount).toBe(1234);
  });

  it("extracts rating from aria-label", () => {
    const card = createMockCard({ rating: "4.5 out of 5 stars" });
    const product = extractProduct(card);
    expect(product.rating).toBe(4.5);
  });

  it("extracts price", () => {
    const card = createMockCard({ price: "$29.99" });
    const product = extractProduct(card);
    expect(product.price).toBe(29.99);
  });

  it("extracts brand", () => {
    const card = createMockCard({ brand: "Sony" });
    const product = extractProduct(card);
    expect(product.brand).toBe("Sony");
  });

  it("detects sponsored products", () => {
    const card = createMockCard({ sponsored: true });
    const product = extractProduct(card);
    expect(product.isSponsored).toBe(true);
  });

  it("detects non-sponsored products", () => {
    const card = createMockCard({ sponsored: false });
    const product = extractProduct(card);
    expect(product.isSponsored).toBe(false);
  });

  it("extracts ASIN from data attribute", () => {
    const card = createMockCard({ asin: "B08N5WRWNW" });
    const product = extractProduct(card);
    expect(product.asin).toBe("B08N5WRWNW");
  });

  it("returns element reference", () => {
    const card = createMockCard();
    const product = extractProduct(card);
    expect(product.element).toBe(card);
  });
});
