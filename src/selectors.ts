/**
 * Amazon DOM Selectors — centralized registry for all Amazon page selectors.
 *
 * Amazon changes their DOM structure regularly (A/B tests, redesigns).
 * This file is the SINGLE PLACE to update when selectors break.
 *
 * Each selector group provides multiple fallbacks tried in order.
 * The first match wins. Add new patterns at the end of each array.
 */

// ── Selector Helper ──────────────────────────────────────────────────

/** Try multiple selectors in order, return the first match. */
export function $(el: ParentNode, ...selectors: string[]): Element | null {
  for (const sel of selectors) {
    const result = el.querySelector(sel);
    if (result) return result;
  }
  return null;
}

/** Try multiple selectors in order, return the first non-empty result. */
export function $$(el: ParentNode, ...selectors: string[]): Element[] {
  for (const sel of selectors) {
    const results = el.querySelectorAll(sel);
    if (results.length > 0) return Array.from(results);
  }
  return [];
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
