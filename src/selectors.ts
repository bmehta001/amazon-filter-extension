/**
 * Amazon DOM Selectors — centralized registry for all Amazon page selectors.
 *
 * Amazon changes their DOM structure regularly (A/B tests, redesigns).
 * This file is the SINGLE PLACE to update when selectors break.
 *
 * Each selector group provides multiple fallbacks tried in order.
 * The first match wins. Add new patterns at the end of each array.
 *
 * REMOTE OVERRIDE: On init, the extension fetches a selector patch
 * JSON from a hosted URL. This allows fixing broken selectors without
 * pushing a Chrome Web Store update (which takes 1-3 days for review).
 * The remote patch is cached in chrome.storage.local with a 1h TTL.
 */

// ── Remote Override System ───────────────────────────────────────────

const REMOTE_SELECTOR_URL = "https://betteramazonsearch.com/selectors.json";
const REMOTE_CACHE_KEY = "bas_selector_overrides";
const REMOTE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Remotely-loaded selector overrides. Applied on top of built-in selectors. */
let remoteOverrides: Record<string, Record<string, string[]>> = {};

/**
 * Load remote selector overrides. Call once on extension init.
 * Non-blocking — if the fetch fails, built-in selectors are used.
 */
export async function loadRemoteSelectors(): Promise<void> {
  try {
    // Check cache first
    const cached = await getCachedOverrides();
    if (cached) {
      remoteOverrides = cached;
      return;
    }

    // Fetch fresh overrides
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(REMOTE_SELECTOR_URL, {
      signal: controller.signal,
      cache: "no-cache",
    });
    clearTimeout(timer);

    if (!response.ok) return;

    const data = await response.json();
    if (data && typeof data === "object") {
      remoteOverrides = data;
      await cacheOverrides(data);
    }
  } catch {
    // Silent failure — built-in selectors are the fallback
  }
}

async function getCachedOverrides(): Promise<Record<string, Record<string, string[]>> | null> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(REMOTE_CACHE_KEY, (result) => {
        if (chrome.runtime.lastError || !result[REMOTE_CACHE_KEY]) {
          resolve(null);
          return;
        }
        const cached = result[REMOTE_CACHE_KEY] as { data: Record<string, Record<string, string[]>>; ts: number };
        if (Date.now() - cached.ts > REMOTE_CACHE_TTL_MS) {
          resolve(null); // Expired
          return;
        }
        resolve(cached.data);
      });
    } catch {
      resolve(null);
    }
  });
}

async function cacheOverrides(data: Record<string, Record<string, string[]>>): Promise<void> {
  try {
    await chrome.storage.local.set({
      [REMOTE_CACHE_KEY]: { data, ts: Date.now() },
    });
  } catch { /* ignore */ }
}

/**
 * Get the effective selectors for a group.key, merging remote overrides.
 * Remote overrides PREPEND to the built-in list (tried first).
 */
function getSelectors(group: string, key: string, builtIn: readonly string[]): string[] {
  const override = remoteOverrides[group]?.[key];
  if (override && Array.isArray(override) && override.length > 0) {
    // Remote overrides are tried first, then built-in fallbacks
    return [...override, ...builtIn];
  }
  return [...builtIn];
}

// ── Selector Helper ──────────────────────────────────────────────────

/** Try multiple selectors in order, return the first match. */
export function $(el: ParentNode, ...selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const result = el.querySelector(sel);
      if (result) return result;
    } catch { /* invalid selector — skip */ }
  }
  return null;
}

/** Try multiple selectors in order, return the first non-empty result. */
export function $$(el: ParentNode, ...selectors: string[]): Element[] {
  for (const sel of selectors) {
    try {
      const results = el.querySelectorAll(sel);
      if (results.length > 0) return Array.from(results);
    } catch { /* invalid selector — skip */ }
  }
  return [];
}

/**
 * Resolve selectors with remote overrides merged in.
 * Usage: sel("SEARCH", "productCard", SEARCH.productCard)
 * Remote overrides for "SEARCH.productCard" are prepended to the array.
 */
export function sel(group: string, key: string, builtIn: readonly string[]): string[] {
  return getSelectors(group, key, builtIn);
}

// ── Search Results Page ──────────────────────────────────────────────

export const SEARCH = {
  /** Product card container. */
  productCard: [
    'div[data-component-type="s-search-result"]',
    'div[data-asin][data-index]',
    'div.s-result-item[data-asin]',
  ],

  /** Product title text. */
  titleText: [
    "h2 a span",
    "h2 span.a-text-normal",
    "h2.a-text-normal > span",
    "h2 > span",
  ],

  /** Star rating icon. */
  rating: [
    'i[class*="a-icon-star"] span.a-icon-alt',
    'a[aria-label*="out of 5 stars"]',
    'span[aria-label*="star"]',
  ],

  /** Price (offscreen or visible). */
  price: [
    "span.a-price span.a-offscreen",
    "span.a-price-whole",
  ],

  /** Price fraction (cents). */
  priceFraction: [
    "span.a-price-fraction",
  ],

  /** Review count link. */
  reviewLink: [
    'a[href*="customerReviews"]',
    'a[href*="#reviews"]',
  ],

  /** Sponsored indicators. */
  sponsored: [
    'span[data-component-type="s-ads-metrics"]',
    '[data-component-type="sp-sponsored-result"]',
    "div.AdHolder",
    "div.s-ad-holder",
  ],

  /** List price (strikethrough). */
  listPrice: [
    "[data-strikethroughprice] .a-text-strike",
    "span.a-text-price:not(.a-size-mini) span.a-offscreen",
    "span.a-text-strike",
  ],

  /** Coupon element. */
  coupon: [
    '[data-component-type="s-coupon-component"]',
    'span[class*="couponBadge"]',
  ],

  /** Deal badge. */
  dealBadge: [
    '[class*="dealBadge"]',
    "[data-deal-badge]",
    "span.a-badge-text",
    "span[class*='dealLabel']",
  ],

  /** Product link (for ASIN extraction). */
  productLink: [
    'h2 a[href*="/dp/"]',
    'a[href*="/dp/"]',
  ],

  /** Brand link. */
  brandLink: [
    'a[href*="field-brandtextbin"]',
    'a[href*="/s?"] span.a-size-base-plus',
  ],
} as const;

// ── Product Detail Page ──────────────────────────────────────────────

export const DETAIL = {
  /** Brand name on detail page. */
  brand: [
    '#bylineInfo a',
    '#brand',
    'a#bylineInfo',
    'tr:has(th:contains("Brand")) td',
  ],

  /** Seller name. */
  seller: [
    '#merchant-info a',
    '#tabular-buybox .tabular-buybox-text a',
    '#sellerProfileTriggerId',
  ],

  /** Country of origin. */
  countryOfOrigin: [
    '#prodDetails tr',
    '#detailBullets_feature_div li',
    '#productDetails_detailBullets_sections1 tr',
  ],

  /** Other sellers section. */
  otherSellers: [
    '#olp-upd-new a',
    '#buybox-see-all-buying-choices a',
    'a[href*="offer-listing"]',
  ],
} as const;

// ── Review Page ──────────────────────────────────────────────────────

export const REVIEW = {
  /** Rating histogram table. */
  histogram: [
    "#histogramTable",
    "table#histogramTable",
    '[data-hook="rating-histogram"]',
    "#cm_cr_dp_d_rating_histogram",
  ],

  /** Histogram rows with star filter links. */
  histogramRow: [
    'a[href*="filterByStar"]',
  ],

  /** Individual review containers. */
  reviewContainer: [
    'div[data-hook="review"]',
    "div.review",
    'div[id^="customer_review-"]',
  ],

  /** Review star rating. */
  reviewRating: [
    'i[data-hook="review-star-rating"] span.a-icon-alt',
    "i.review-rating span.a-icon-alt",
  ],

  /** Review body text. */
  reviewBody: [
    'span[data-hook="review-body"] span',
    'span[data-hook="review-body"]',
  ],

  /** Review date. */
  reviewDate: [
    'span[data-hook="review-date"]',
  ],

  /** Verified purchase badge. */
  verifiedPurchase: [
    'span[data-hook="avp-badge"]',
  ],

  /** Helpful votes. */
  helpfulVotes: [
    'span[data-hook="helpful-vote-statement"]',
  ],

  /** Total rating count. */
  totalRatings: [
    'span[data-hook="total-review-count"]',
    "#acrCustomerReviewText",
  ],

  /** Average rating text. */
  averageRating: [
    'span[data-hook="rating-out-of-text"]',
    'i[data-hook="average-star-rating"] span.a-icon-alt',
  ],

  /** Review images. */
  reviewImages: [
    'img.review-image-tile',
    'img[data-hook="review-image-tile"]',
  ],

  /** Review video tiles. */
  reviewVideos: [
    'div[data-hook="review-video-tile"]',
    "video",
    "[data-video-url]",
  ],

  /** Top-level media gallery. */
  mediaGallery: [
    "#cr-media-gallery-popover",
    '[data-hook="cr-media-gallery"]',
  ],
} as const;

// ── Product Detail — Listing Completeness ────────────────────────────

export const LISTING = {
  /** Product details tables (for field detection). */
  detailTables: [
    "#prodDetails tr",
    "#detailBullets_feature_div li",
    "#productDetails_detailBullets_sections1 tr",
    ".content-grid-block tr",
    ".detail-bullet-list span",
  ],

  /** Tech spec table. */
  techSpec: [
    "#technicalSpecifications_section_1 tr",
    "#productDetails_techSpec_section_1 tr",
  ],

  /** Spec table containers (for existence check). */
  specTable: [
    "#productDetails_techSpec_section_1",
    "#technicalSpecifications_section_1",
    "#prodDetails table",
    ".a-normal.a-spacing-micro",
  ],

  /** Product description. */
  description: [
    "#productDescription",
    "#aplus",
    ".aplus-v2",
  ],

  /** Product images (for count check). */
  images: [
    "#altImages img",
    ".imageThumbnail img",
    "#imageBlock img",
  ],

  /** Feature bullet points. */
  bulletPoints: [
    "#feature-bullets li",
    ".a-unordered-list.a-vertical li",
  ],

  /** Section headings (for named section detection). */
  headings: [
    "h1", "h2", "h3", "h4", "h5",
    ".a-text-bold",
  ],
} as const;

// ── BSR Extraction ───────────────────────────────────────────────────

export const BSR = {
  /** Product detail sections to search for BSR. */
  sections: [
    "#prodDetails",
    "#detailBullets_feature_div",
    "#productDetails_detailBullets_sections1",
  ],

  /** Broader page sections (fallback). */
  broadSections: [
    "#ppd",
    "#prodDetails",
    "#detailBulletsWrapper_feature_div",
  ],
} as const;
