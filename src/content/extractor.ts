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
  /** Star rating (aria-label like "4.5 out of 5 stars"). */
  rating: 'i.a-icon-star-small span.a-icon-alt, span[aria-label*="star"]',
  /** Price (offscreen or visible). */
  price: "span.a-price span.a-offscreen, span.a-price-whole",
  /** Price fraction (cents). */
  priceFraction: "span.a-price-fraction",
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
  // Priority 1: link to customer reviews (most reliable)
  const reviewLink = card.querySelector<HTMLAnchorElement>('a[href*="customerReviews"]');
  if (reviewLink) {
    const linkSpan = reviewLink.querySelector("span");
    const text = (linkSpan?.textContent || reviewLink.textContent || "").trim();
    const count = parseCount(text);
    if (count > 0) return count;
  }

  // Priority 2: underlined spans that look like review counts
  const underlined = card.querySelectorAll("span.s-underline-text");
  for (const span of underlined) {
    const text = span.textContent?.trim() || "";
    if (/^[\d,.]+[kKmMbB]?$/.test(text)) {
      const count = parseCount(text);
      if (count > 0) return count;
    }
  }

  // Priority 3: aria-label containing review info
  const ariaEls = card.querySelectorAll('[aria-label*="rating" i], [aria-label*="review" i]');
  for (const el of ariaEls) {
    const label = el.getAttribute("aria-label") || "";
    const match = label.match(/([\d,.]+[kKmMbB]?)\s*(?:rating|review)/i);
    if (match) {
      const count = parseCount(match[1]);
      if (count > 0) return count;
    }
  }

  return 0;
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
  // Strategy 1: Dedicated brand row — a link or span directly under the title.
  // Amazon typically renders the brand as a link immediately after the <h2>.
  const h2 = card.querySelector("h2");
  if (h2) {
    // Walk siblings of the h2's parent to find brand text
    const h2Container = h2.closest(".a-section, .a-row, div") || h2.parentElement;
    if (h2Container) {
      // Look for "by BrandName" links right after the title
      const byLink = h2Container.querySelector('a[href*="/s?"], a[href*="field-brandtextbin"]');
      if (byLink?.textContent?.trim()) {
        const text = byLink.textContent.trim();
        if (text.length > 0 && text.length < 60) return text;
      }
    }
  }

  // Strategy 2: "Visit the X Store" pattern (very reliable when present)
  const visitPattern = card.textContent?.match(
    /Visit the\s+(.+?)\s+Store/i,
  );
  if (visitPattern) {
    return visitPattern[1].trim();
  }

  // Strategy 3: "by BrandName" or "Brand: BrandName" anywhere in the card
  const byPattern = card.textContent?.match(
    /\bby\s+([A-Z][A-Za-z0-9 &'.+-]{0,39})/,
  );
  if (byPattern) {
    const brand = byPattern[1].trim();
    // Filter out false positives: "by" followed by generic words
    const falsePositives = /^(Amazon|the |this |that |a |an )/i;
    if (!falsePositives.test(brand) && brand.length > 1) {
      return brand;
    }
  }

  // Strategy 4: Explicit brand element (narrower selectors)
  // Only use the span immediately following a "by" text node or in a brand-specific row
  const brandRow = card.querySelector(
    'div.a-row.a-size-base > span.a-size-base-plus.a-color-base, ' +
    'h5.s-line-clamp-1 > span',
  );
  if (brandRow?.textContent?.trim()) {
    let text = brandRow.textContent.trim();
    text = text
      .replace(/^visit\s+the\s+/i, "")
      .replace(/\s+store$/i, "")
      .replace(/\s+shop$/i, "")
      .replace(/^see\s+all\s+.*$/i, "")
      .replace(/^shop\s+/i, "")
      .replace(/^by\s+/i, "")
      .trim();
    if (
      text.length > 0 &&
      text.length < 60 &&
      !text.toLowerCase().includes("result") &&
      !text.startsWith("$") &&
      !/^\d/.test(text) &&
      !text.toLowerCase().startsWith("see ")
    ) {
      return text;
    }
  }

  // Strategy 5: aria-label on brand links
  const brandLink = card.querySelector<HTMLAnchorElement>(
    'a[href*="brandtextbin"], a[aria-label*="brand" i]',
  );
  if (brandLink) {
    const label = brandLink.ariaLabel || brandLink.textContent?.trim();
    if (label && label.length > 0 && label.length < 60) return label;
  }

  return "Unknown";
}

function detectSponsored(card: HTMLElement): boolean {
  // 1. Modern ads metrics component
  if (card.querySelector('span[data-component-type="s-ads-metrics"]')) {
    return true;
  }

  // 2. Newer sponsored result marker
  if (card.querySelector('[data-component-type="sp-sponsored-result"]')) {
    return true;
  }

  // 3. Ad holder containers
  if (card.querySelector("div.AdHolder, div.s-ad-holder")) {
    return true;
  }

  // 4. Data attributes on the card itself
  if (card.dataset.isSponsored === "true" || card.dataset.sponsored === "true") {
    return true;
  }

  // 5. Aria-labels containing "Sponsored"
  const ariaEls = card.querySelectorAll("[aria-label]");
  for (const el of ariaEls) {
    const label = el.getAttribute("aria-label") || "";
    if (/\bsponsored\b/i.test(label)) {
      return true;
    }
  }

  // 6. Text-based "Sponsored" in secondary spans (classic pattern)
  const spans = card.querySelectorAll("span.a-color-secondary, span.puis-label-popover-default");
  for (const span of spans) {
    const text = span.textContent?.trim().toLowerCase() || "";
    if (text === "sponsored" || text === "ad" || /^sponsored\b/.test(text)) {
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
