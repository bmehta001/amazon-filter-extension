import type { Product } from "../types";
import { parseCount, parseRating, parsePrice, extractAsin } from "../util/parse";

// ── Amazon DOM selectors (centralized for easy updates) ──────────────

const SELECTORS = {
  /** Top-level product card container. */
  productCard: 'div[data-component-type="s-search-result"]',
  /** Title link inside the card. */
  titleLink: "h2 a.a-link-normal",
  /** Title text span. */
  titleText: "h2 a span, h2 span.a-text-normal",
  /** Review count (e.g. "1,234"). */
  reviewCount:
    'span[data-component-type="s-client-side-analytics"] span.a-size-base.s-underline-text, a[href*="customerReviews"] span.a-size-base, span.a-size-base.s-underline-text',
  /** Star rating (aria-label like "4.5 out of 5 stars"). */
  rating: 'i.a-icon-star-small span.a-icon-alt, span[aria-label*="star"]',
  /** Price (offscreen or visible). */
  price: "span.a-price span.a-offscreen, span.a-price-whole",
  /** Price fraction (cents). */
  priceFraction: "span.a-price-fraction",
  /** Brand name line below the title. */
  brand:
    "span.a-size-base-plus.a-color-base, h5.s-line-clamp-1 span, span.a-size-base.a-color-secondary + span",
  /** Sponsored label. */
  sponsored:
    'span.a-color-secondary:not(.a-text-normal), span[data-component-type="s-ads-metrics"]',
} as const;

/**
 * Extract all product cards from the current page.
 */
export function getProductCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.productCard));
}

/**
 * Parse a single product card element into a structured Product object.
 */
export function extractProduct(card: HTMLElement): Product {
  const title = extractTitle(card);
  const reviewCount = extractReviewCount(card);
  const rating = extractRating(card);
  const price = extractPrice(card);
  const brand = extractBrand(card, title);
  const isSponsored = detectSponsored(card);
  const asin = card.dataset.asin || extractAsinFromLinks(card);

  return {
    element: card,
    title,
    reviewCount,
    rating,
    price,
    brand,
    isSponsored,
    asin,
  };
}

/**
 * Extract all products from the page.
 */
export function extractAllProducts(): Product[] {
  return getProductCards().map(extractProduct);
}

// ── Private extraction helpers ───────────────────────────────────────

function extractTitle(card: HTMLElement): string {
  const el = card.querySelector(SELECTORS.titleText);
  return el?.textContent?.trim() || "";
}

function extractReviewCount(card: HTMLElement): number {
  const el = card.querySelector(SELECTORS.reviewCount);
  return parseCount(el?.textContent || "");
}

function extractRating(card: HTMLElement): number {
  // Try aria-label first (more reliable)
  const starEl = card.querySelector(SELECTORS.rating);
  const ariaLabel =
    starEl?.getAttribute("aria-label") || starEl?.textContent || "";
  return parseRating(ariaLabel);
}

function extractPrice(card: HTMLElement): number | null {
  const offscreen = card.querySelector("span.a-price span.a-offscreen");
  if (offscreen?.textContent) {
    return parsePrice(offscreen.textContent);
  }
  const whole = card.querySelector("span.a-price-whole");
  const fraction = card.querySelector(SELECTORS.priceFraction);
  if (whole?.textContent) {
    const priceStr = `${whole.textContent}${fraction?.textContent || "00"}`;
    return parsePrice(priceStr);
  }
  return null;
}

function extractBrand(card: HTMLElement, title: string): string {
  // Try explicit brand element
  const brandEl = card.querySelector(SELECTORS.brand);
  if (brandEl?.textContent?.trim()) {
    const text = brandEl.textContent.trim();
    // Filter out common false positives
    if (
      text.length < 100 &&
      !text.includes("result") &&
      !text.startsWith("$")
    ) {
      return text;
    }
  }
  // Fallback: look for "by BrandName" or "Visit the BrandName Store" patterns
  const byPattern = card.textContent?.match(
    /(?:by|Brand:)\s+([A-Za-z0-9][A-Za-z0-9 &'.+-]{1,40})/,
  );
  if (byPattern) {
    return byPattern[1].trim();
  }
  // Last resort: use first few words of title as a guess
  return title.split(/\s+/).slice(0, 2).join(" ");
}

function detectSponsored(card: HTMLElement): boolean {
  // Check for the ads metrics component
  if (card.querySelector('span[data-component-type="s-ads-metrics"]')) {
    return true;
  }
  // Check for "Sponsored" text
  const spans = card.querySelectorAll("span.a-color-secondary");
  for (const span of spans) {
    if (span.textContent?.trim().toLowerCase() === "sponsored") {
      return true;
    }
  }
  return false;
}

function extractAsinFromLinks(card: HTMLElement): string | null {
  const link = card.querySelector<HTMLAnchorElement>("h2 a[href]");
  if (link?.href) {
    return extractAsin(link.href);
  }
  return null;
}
