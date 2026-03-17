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
  reviewCountLink?: boolean;
  rating?: string;
  price?: string;
  brand?: string;
  sponsored?: boolean;
  sponsoredType?: "classic" | "ads-metrics" | "sp-sponsored" | "data-attr" | "aria-label" | "ad-holder";
  asin?: string;
  urlSlug?: string;
} = {}): HTMLElement {
  const card = document.createElement("div");
  card.setAttribute("data-component-type", "s-search-result");
  if (opts.asin) card.dataset.asin = opts.asin;

  // Title
  const h2 = document.createElement("h2");
  const link = document.createElement("a");
  link.className = "a-link-normal";
  const asin = opts.asin || "B000000000";
  // Use URL slug if provided, otherwise simple /dp/ASIN path
  if (opts.urlSlug) {
    link.href = `/${opts.urlSlug}/dp/${asin}/ref=sr_1_1`;
  } else {
    link.href = `/dp/${asin}`;
  }
  const span = document.createElement("span");
  span.textContent = opts.title || "Test Product";
  link.appendChild(span);
  h2.appendChild(link);
  card.appendChild(h2);

  // Review count
  if (opts.reviewCount) {
    if (opts.reviewCountLink) {
      const reviewLink = document.createElement("a");
      reviewLink.href = "#customerReviews";
      const reviewSpan = document.createElement("span");
      reviewSpan.textContent = opts.reviewCount;
      reviewLink.appendChild(reviewSpan);
      card.appendChild(reviewLink);
    } else {
      const reviewSpan = document.createElement("span");
      reviewSpan.className = "a-size-base s-underline-text";
      reviewSpan.textContent = opts.reviewCount;
      card.appendChild(reviewSpan);
    }
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

  // Brand - simulate Amazon's "by BrandName" pattern
  if (opts.brand) {
    const brandRow = document.createElement("div");
    brandRow.className = "a-row a-size-base";
    const byText = document.createTextNode("by ");
    brandRow.appendChild(byText);
    const brandSpan = document.createElement("span");
    brandSpan.className = "a-size-base-plus a-color-base";
    brandSpan.textContent = opts.brand;
    brandRow.appendChild(brandSpan);
    card.appendChild(brandRow);
  }

  // Sponsored
  if (opts.sponsored) {
    const type = opts.sponsoredType || "classic";
    if (type === "classic") {
      const sponsoredSpan = document.createElement("span");
      sponsoredSpan.className = "a-color-secondary";
      sponsoredSpan.textContent = "Sponsored";
      card.appendChild(sponsoredSpan);
    } else if (type === "ads-metrics") {
      const metricsSpan = document.createElement("span");
      metricsSpan.setAttribute("data-component-type", "s-ads-metrics");
      card.appendChild(metricsSpan);
    } else if (type === "sp-sponsored") {
      const spSpan = document.createElement("span");
      spSpan.setAttribute("data-component-type", "sp-sponsored-result");
      card.appendChild(spSpan);
    } else if (type === "data-attr") {
      card.dataset.isSponsored = "true";
    } else if (type === "aria-label") {
      const labelSpan = document.createElement("span");
      labelSpan.setAttribute("aria-label", "Sponsored ad from brand");
      card.appendChild(labelSpan);
    } else if (type === "ad-holder") {
      const adDiv = document.createElement("div");
      adDiv.className = "AdHolder";
      card.appendChild(adDiv);
    }
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

  it("extracts review count with K suffix", () => {
    const card = createMockCard({ reviewCount: "2.5K" });
    const product = extractProduct(card);
    expect(product.reviewCount).toBe(2500);
  });

  it("extracts review count from customerReviews link", () => {
    const card = createMockCard({ reviewCount: "12,345", reviewCountLink: true });
    const product = extractProduct(card);
    expect(product.reviewCount).toBe(12345);
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

  it("cleans up 'Visit the X Store' brand text", () => {
    const card = createMockCard({ brand: "Visit the Philips Store" });
    const product = extractProduct(card);
    expect(product.brand).toBe("Philips");
  });

  it("returns Unknown for generic title-only brand fallback", () => {
    const card = createMockCard({ title: "Wireless Headphones Pro" });
    const product = extractProduct(card);
    expect(product.brand).toBe("Unknown");
  });

  // ── URL slug brand extraction (Strategy 6) ──

  it("extracts brand from URL slug", () => {
    const card = createMockCard({
      title: "Noise Cancelling Headphones",
      urlSlug: "Soundcore-Cancelling-Headphones-Bluetooth-Comfortable",
    });
    const product = extractProduct(card);
    expect(product.brand).toBe("Soundcore");
  });

  it("extracts brand from URL slug with known brand", () => {
    const card = createMockCard({
      title: "WF-1000XM5 Earbuds",
      urlSlug: "Sony-WF-1000XM5-Cancelling-Truly",
    });
    const product = extractProduct(card);
    expect(product.brand).toBe("Sony");
  });

  it("skips generic URL slug word and falls through to title", () => {
    const card = createMockCard({
      title: "Bose QuietComfort Earbuds",
      urlSlug: "Bluetooth-Wireless-Earbuds-Headphones",
    });
    const product = extractProduct(card);
    expect(product.brand).toBe("Bose");
  });

  it("extracts brand from slug when title starts with generic word", () => {
    const card = createMockCard({
      title: "Wireless Noise Cancelling Over Ear Headphones",
      urlSlug: "MMWOWARTS-Cancelling-Headphones-Bluetooth-Lightweight",
    });
    const product = extractProduct(card);
    expect(product.brand).toBe("MMWOWARTS");
  });

  it("falls through slug for sponsored /sspa/ links to title", () => {
    // Sponsored cards have /sspa/click links, no slug — simulate no slug
    const card = createMockCard({
      title: "JBL Tune 510BT Headphones",
    });
    const product = extractProduct(card);
    expect(product.brand).toBe("JBL");
  });

  it("prefers DOM brand over URL slug", () => {
    const card = createMockCard({
      brand: "Anker",
      title: "Soundcore Life Q20i Headphones",
      urlSlug: "Soundcore-Anker-Life-Q20i-Headphones",
    });
    const product = extractProduct(card);
    expect(product.brand).toBe("Anker");
  });

  it("detects sponsored products (classic)", () => {
    const card = createMockCard({ sponsored: true, sponsoredType: "classic" });
    const product = extractProduct(card);
    expect(product.isSponsored).toBe(true);
  });

  it("detects sponsored via ads-metrics component", () => {
    const card = createMockCard({ sponsored: true, sponsoredType: "ads-metrics" });
    const product = extractProduct(card);
    expect(product.isSponsored).toBe(true);
  });

  it("detects sponsored via sp-sponsored-result", () => {
    const card = createMockCard({ sponsored: true, sponsoredType: "sp-sponsored" });
    const product = extractProduct(card);
    expect(product.isSponsored).toBe(true);
  });

  it("detects sponsored via data attribute", () => {
    const card = createMockCard({ sponsored: true, sponsoredType: "data-attr" });
    const product = extractProduct(card);
    expect(product.isSponsored).toBe(true);
  });

  it("detects sponsored via aria-label", () => {
    const card = createMockCard({ sponsored: true, sponsoredType: "aria-label" });
    const product = extractProduct(card);
    expect(product.isSponsored).toBe(true);
  });

  it("detects sponsored via AdHolder div", () => {
    const card = createMockCard({ sponsored: true, sponsoredType: "ad-holder" });
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
