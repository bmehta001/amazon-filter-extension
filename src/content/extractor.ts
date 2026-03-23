import type { Product, CouponInfo } from "../types";
import { parseCount, parseRating, parsePrice, extractAsin } from "../util/parse";
import { isLearnedBrand } from "../brand/learning";

// ── Amazon DOM selectors (centralized for easy updates) ──────────────

const SELECTORS = {
  /** Top-level product card container. */
  productCard: 'div[data-component-type="s-search-result"]',
  /** Title text span (multiple patterns for different Amazon layouts). */
  titleText: "h2 a span, h2 span.a-text-normal, h2.a-text-normal > span, h2 > span",
  /** Star rating text (inside icon-alt spans within star icons). */
  rating:
    'i[class*="a-icon-star"] span.a-icon-alt, ' +
    'a[aria-label*="out of 5 stars"], ' +
    'span[aria-label*="star"]',
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
  const listPrice = extractListPrice(card);
  const coupon = extractCoupon(card);
  const hasDealBadge = extractDealBadge(card);
  const subscribeAndSave = extractSubscribeAndSave(card);

  return {
    element: card,
    title,
    reviewCount,
    rating,
    price,
    brand,
    isSponsored,
    asin,
    brandCertain: brand !== "Unknown",
    listPrice: listPrice ?? undefined,
    coupon: coupon ?? undefined,
    hasDealBadge,
    subscribeAndSave: subscribeAndSave ?? undefined,
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

// ── Generic words that are NOT brand names (shared by slug + title extraction) ──
// Comprehensive list — if slug/title hits a generic word, the async brand fetcher
// will look up the real brand from the product detail page.
const GENERIC_WORDS = new Set([
  // Articles, prepositions, conjunctions
  "the", "a", "an", "for", "with", "and", "in", "on", "to", "of", "by",

  // Common adjectives / descriptors
  "wireless", "bluetooth", "true", "sports", "premium", "professional",
  "portable", "mini", "ultra", "super", "new", "upgraded", "original",
  "genuine", "official", "authentic", "classic", "advanced", "smart",
  "digital", "electric", "automatic", "universal", "adjustable",
  "waterproof", "rechargeable", "foldable", "lightweight", "compact",
  "heavy", "duty", "high", "quality", "best", "top", "pro", "max",
  "industrial", "commercial", "organic", "natural", "ergonomic",
  "magnetic", "solar", "thermal", "acoustic", "optical",
  "durable", "flexible", "silicone", "stainless", "steel", "cotton",
  "noise", "cancelling", "canceling", "active",

  // Quantifiers and sizes
  "pack", "set", "pair", "piece", "pcs", "count", "size", "large",
  "small", "medium", "extra", "xl", "xxl", "xxxl",

  // Demographics
  "baby", "kids", "men", "women", "adult", "toddler", "infant",
  "boys", "girls", "unisex", "teen",

  // Product category nouns (common slug/title starters that aren't brands)
  "washcloths", "headphones", "earbuds", "headset", "speaker", "charger",
  "stroller", "monitor", "camera", "phone", "tablet", "laptop", "mouse",
  "keyboard", "cable", "adapter", "case", "cover", "stand", "holder",
  "bottle", "blanket", "pillow", "mattress", "towel", "socks", "shoes",
  "boots", "sneakers", "sandals", "slippers", "jacket", "shirt", "pants",
  "dress", "skirt", "sweater", "hoodie", "hat", "cap", "gloves", "scarf",
  "backpack", "bag", "purse", "wallet", "belt", "watch", "ring",
  "necklace", "bracelet", "earrings", "sunglasses", "glasses",
  "squeaky", "chew", "plush", "interactive", "treat",
  "drawer", "shelf", "rack", "bin", "basket", "organizer", "container",
  "lamp", "light", "bulb", "fan", "heater", "filter", "pump", "valve",
  "tool", "wrench", "drill", "saw", "hammer", "screwdriver",

  // Colors (common slug starters)
  "black", "white", "red", "blue", "green", "pink", "purple", "grey",
  "gray", "brown", "gold", "silver", "clear", "multicolor",

  // Numbers and years
  "2024", "2025", "2026", "2027",
]);

/**
 * Check if a word looks like a brand name (not a generic descriptor).
 * Also checks learned brand words from prior sessions.
 */
export function isBrandWord(word: string): boolean {
  if (word.length < 2 || word.length > 30 || !/^[A-Z]/i.test(word)) return false;
  // Learned brands override the generic list
  if (isLearnedBrand(word)) return true;
  return !GENERIC_WORDS.has(word.toLowerCase());
}

/** Exported for testing and self-improvement system. */
export { GENERIC_WORDS };

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

  // Strategy 3: "by BrandName" anywhere in the card.
  // Limit to brand name only (1-3 words), stopping at model numbers/descriptors.
  const byPattern = card.textContent?.match(
    /\bby\s+([A-Z][A-Za-z&'.+-]+(?:\s+[A-Z][A-Za-z&'.+-]+){0,2})/,
  );
  if (byPattern) {
    const brand = byPattern[1].trim();
    const falsePositives = /^(Amazon|the|this|that|an?)\b/i;
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

  // Strategy 6: URL slug extraction.
  // Amazon product URLs follow /Brand-Product-Words/dp/ASIN/ — first word is the brand.
  const productLink = card.querySelector<HTMLAnchorElement>('h2 a[href*="/dp/"]');
  if (productLink) {
    const slugMatch = productLink.getAttribute("href")?.match(/\/([^/]+)\/dp\//);
    if (slugMatch) {
      const firstWord = slugMatch[1].split("-")[0];
      if (isBrandWord(firstWord)) {
        return firstWord;
      }
    }
  }

  // Strategy 7: Extract brand from the product title (first word heuristic).
  // Amazon often puts the brand as the first word(s) of the title.
  if (title) {
    const firstWord = title.split(/[\s,\-]+/)[0];
    if (firstWord && isBrandWord(firstWord) && /^[A-Z]/.test(firstWord)) {
      return firstWord;
    }
  }

  return "Unknown";
}

/**
 * Extract the candidate brand word from URL slug or title that may have been
 * rejected by the generic word filter. Used by the learning system to compare
 * against the definitive brand from the product detail page.
 */
export function extractBrandCandidate(card: HTMLElement, title: string): string | null {
  // Check URL slug
  const productLink = card.querySelector<HTMLAnchorElement>('h2 a[href*="/dp/"]');
  if (productLink) {
    const slugMatch = productLink.getAttribute("href")?.match(/\/([^/]+)\/dp\//);
    if (slugMatch) {
      const firstWord = slugMatch[1].split("-")[0];
      if (firstWord && firstWord.length >= 2 && /^[A-Z]/i.test(firstWord)) {
        return firstWord;
      }
    }
  }

  // Check title first word
  if (title) {
    const firstWord = title.split(/[\s,\-]+/)[0];
    if (firstWord && firstWord.length >= 2 && /^[A-Z]/.test(firstWord)) {
      return firstWord;
    }
  }

  return null;
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

// ── Deal Signal Extraction ──────────────────────────────────────────

/**
 * Extract the original "List" price (strikethrough price) from a product card.
 * Amazon shows this as crossed-out text when the current price is discounted.
 */
export function extractListPrice(card: HTMLElement): number | null {
  // Strategy 1: [data-strikethroughprice] .a-text-strike
  const strikeEl = card.querySelector("[data-strikethroughprice] .a-text-strike");
  if (strikeEl?.textContent) {
    return parsePrice(strikeEl.textContent);
  }

  // Strategy 2: span.a-text-price (the "was" price container)
  const textPrice = card.querySelector("span.a-text-price:not(.a-size-mini) span.a-offscreen");
  if (textPrice?.textContent) {
    return parsePrice(textPrice.textContent);
  }

  // Strategy 3: "List:" label followed by strikethrough
  const listLabel = card.querySelector("span.a-text-strike");
  if (listLabel?.textContent) {
    return parsePrice(listLabel.textContent);
  }

  return null;
}

/**
 * Extract coupon info from a product card.
 * Amazon shows coupons as "Save X% with coupon" or "Save $X.XX with coupon".
 */
export function extractCoupon(card: HTMLElement): CouponInfo | null {
  const couponEl = card.querySelector('[data-component-type="s-coupon-component"]');
  if (!couponEl) return null;

  const text = couponEl.textContent || "";

  // Match "Save 35%" pattern
  const percentMatch = text.match(/Save\s+(\d+)%/i);
  if (percentMatch) {
    return { type: "percent", value: parseInt(percentMatch[1], 10) };
  }

  // Match "Save $5.00" or "$5 off" patterns
  const amountMatch = text.match(/Save\s+\$?([\d.]+)/i) || text.match(/\$([\d.]+)\s+off/i);
  if (amountMatch) {
    return { type: "amount", value: parseFloat(amountMatch[1]) };
  }

  // Coupon present but couldn't parse value
  return null;
}

/**
 * Detect if a "Limited time deal" badge is present on a product card.
 */
export function extractDealBadge(card: HTMLElement): boolean {
  // Check for deal badge by CSS class (hashed but stable prefix)
  const badgeEl = card.querySelector('[class*="dealBadge"], [data-deal-badge]');
  if (badgeEl) return true;

  // Check for "Limited time deal" text in badge-like elements
  const badges = card.querySelectorAll("span.a-badge-text, span[class*='dealLabel']");
  for (const badge of badges) {
    if (badge.textContent?.toLowerCase().includes("limited time deal")) {
      return true;
    }
  }

  // Also check for deal text in the general card
  const dealText = card.querySelector("span.a-size-mini");
  if (dealText?.textContent?.toLowerCase().includes("limited time deal")) {
    return true;
  }

  return false;
}

/**
 * Extract Subscribe & Save discount percentage from a product card.
 * Amazon shows this as "Save X% with Subscribe & Save" or similar text.
 */
export function extractSubscribeAndSave(card: HTMLElement): number | null {
  // Strategy 1: Dedicated S&S component
  const snsEl = card.querySelector(
    '[data-component-type="s-subscribe-and-save"], ' +
    '[class*="subscribe"], [id*="subscribe"]',
  );
  if (snsEl) {
    const text = snsEl.textContent || "";
    const match = text.match(/(\d+)\s*%/);
    if (match) return parseInt(match[1], 10);
  }

  // Strategy 2: Text-based search across the card for S&S patterns
  const cardText = card.textContent || "";
  if (/subscribe\s*(?:&|and)\s*save/i.test(cardText)) {
    const match =
      cardText.match(/save\s+(?:an?\s+)?(?:extra\s+)?(\d+)\s*%\s*(?:with\s+)?(?:subscribe|S&S)/i) ||
      cardText.match(/(\d+)\s*%\s*(?:with\s+)?(?:subscribe\s*(?:&|and)\s*save|S&S)/i) ||
      cardText.match(/(?:subscribe\s*(?:&|and)\s*save|S&S)[^%]*?(\d+)\s*%/i);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}
