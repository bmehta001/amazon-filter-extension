/**
 * Product detail fetcher — extracts brand and seller info from an Amazon
 * product detail page. Used as a fallback for data not available on search cards.
 */

import type { SellerInfo, FulfillmentType, MultiBuyOffer, BsrInfo } from "../types";
import { analyzeListingCompleteness } from "../listing/completeness";
import type { ListingCompleteness } from "../listing/completeness";

const TAG = "[BAS]";
const FETCH_TIMEOUT_MS = 10_000;

/** Combined result from a product detail page fetch. */
export interface ProductDetailResult {
  brand: string | null;
  seller: SellerInfo | null;
  countryOfOrigin: string | null;
  /** Number of other sellers offering this product. */
  otherSellersCount: number;
  /** Lowest "new" price from other sellers. */
  otherSellersMinPrice: number | null;
  /** Multi-buy promotional offer (e.g., "Buy 2, save 10%"). */
  multiBuyOffer: MultiBuyOffer | null;
  /** Best Sellers Rank in top-level category. */
  bsr: BsrInfo | null;
  /** Listing completeness analysis result. */
  listingCompleteness: ListingCompleteness | null;
}

/**
 * Fetch the product detail page and extract brand + seller info.
 */
export async function fetchProductDetails(asin: string, departmentId?: string | null): Promise<ProductDetailResult> {
  try {
    const url = `https://${window.location.hostname}/dp/${asin}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      credentials: "same-origin",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      console.warn(TAG, `Detail fetch failed for ${asin}: HTTP ${response.status}`);
      return { brand: null, seller: null, countryOfOrigin: null, otherSellersCount: 0, otherSellersMinPrice: null, multiBuyOffer: null, bsr: null, listingCompleteness: null };
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const otherSellers = extractOtherSellersInfo(doc);
    const seller = extractSellerFromDocument(doc);
    if (seller) {
      seller.otherSellersCount = otherSellers.count;
      seller.otherSellersMinPrice = otherSellers.minPrice ?? undefined;
    }

    return {
      brand: extractBrandFromDocument(doc),
      seller,
      countryOfOrigin: extractCountryOfOrigin(doc),
      otherSellersCount: otherSellers.count,
      otherSellersMinPrice: otherSellers.minPrice,
      multiBuyOffer: extractMultiBuyOffer(doc),
      bsr: extractBsr(doc),
      listingCompleteness: analyzeListingCompleteness(doc, departmentId ?? null),
    };
  } catch (err) {
    console.warn(TAG, `Error fetching details for ${asin}:`, err);
    return { brand: null, seller: null, countryOfOrigin: null, otherSellersCount: 0, otherSellersMinPrice: null, multiBuyOffer: null, bsr: null, listingCompleteness: null };
  }
}

/**
 * Legacy single-value brand fetcher (used by existing callers).
 */
export async function fetchBrandFromPage(asin: string): Promise<string | null> {
  const result = await fetchProductDetails(asin);
  return result.brand;
}

/**
 * Extract brand from a parsed product detail page document.
 * Tries multiple selectors in priority order.
 */
export function extractBrandFromDocument(doc: Document): string | null {
  // Strategy 1: "Visit the X Store" or "Brand: X" in #bylineInfo
  const byline = doc.querySelector<HTMLElement>("#bylineInfo");
  if (byline?.textContent) {
    const text = byline.textContent.trim();
    // "Visit the Sony Store" → "Sony"
    const visitMatch = text.match(/Visit the\s+(.+?)\s+Store/i);
    if (visitMatch) return visitMatch[1].trim();
    // "Brand: Sony" → "Sony"
    const brandMatch = text.match(/Brand:\s*(.+)/i);
    if (brandMatch) return brandMatch[1].trim();
    // Plain text brand link
    if (text.length > 0 && text.length < 60 && !/visit|store|brand:/i.test(text)) {
      return text;
    }
  }

  // Strategy 2: Direct brand link element
  const brandLink = doc.querySelector<HTMLElement>("a#brand");
  if (brandLink?.textContent?.trim()) {
    return brandLink.textContent.trim();
  }

  // Strategy 3: Product overview table "Brand" row
  const poRows = doc.querySelectorAll("tr.po-brand td.po-break-word");
  for (const td of poRows) {
    const text = td.textContent?.trim();
    if (text && text.length > 0 && text.length < 60) return text;
  }

  // Strategy 4: Tech specs table
  const techRows = doc.querySelectorAll(
    "#productDetails_techSpec_section_1 tr, " +
    "#productDetails_detailBullets_sections1 tr"
  );
  for (const row of techRows) {
    const header = row.querySelector("th, td:first-child");
    const value = row.querySelector("td:last-child");
    if (header?.textContent?.trim().toLowerCase() === "brand" && value?.textContent?.trim()) {
      return value.textContent.trim();
    }
  }

  // Strategy 5: Detail bullets format
  const bullets = doc.querySelectorAll("#detailBullets_feature_div li span.a-list-item");
  for (const li of bullets) {
    const text = li.textContent || "";
    const match = text.match(/Brand\s*[:\u200F\u200E]\s*(.+)/i);
    if (match) return match[1].trim();
  }

  return null;
}

/**
 * Extract seller/fulfillment info from a parsed product detail page.
 */
export function extractSellerFromDocument(doc: Document): SellerInfo | null {
  // Strategy 1: #merchant-info — "Ships from and sold by Amazon.com"
  const merchantInfo = doc.querySelector<HTMLElement>("#merchant-info");
  if (merchantInfo?.textContent) {
    return parseSellerText(merchantInfo.textContent);
  }

  // Strategy 2: Tabular buy box — newer layout
  const buyBoxRows = doc.querySelectorAll(
    "#tabular-buybox .tabular-buybox-text, " +
    "#buyBoxAccordion .tabular-buybox-text, " +
    "#newAccordionRow .tabular-buybox-text"
  );
  let soldBy = "";
  let shipsFrom = "";
  for (const row of buyBoxRows) {
    const text = row.textContent?.trim() || "";
    const label = row.previousElementSibling?.textContent?.trim().toLowerCase() || "";
    if (label.includes("sold by") || label.includes("seller")) {
      soldBy = text;
    } else if (label.includes("ships from") || label.includes("fulfilled")) {
      shipsFrom = text;
    }
  }
  if (soldBy || shipsFrom) {
    return classifySeller(soldBy, shipsFrom);
  }

  // Strategy 3: Seller profile link
  const sellerLink = doc.querySelector<HTMLElement>(
    "#sellerProfileTriggerId, a[href*='seller=']"
  );
  if (sellerLink?.textContent?.trim()) {
    const name = sellerLink.textContent.trim();
    return {
      sellerName: name,
      fulfillment: isAmazonSeller(name) ? "amazon" : "third-party",
    };
  }

  // Strategy 4: SFB (Sold/Fulfilled by) text patterns anywhere in buy box
  const buyBox = doc.querySelector("#buybox, #desktop_buybox, #ppd");
  if (buyBox?.textContent) {
    return parseSellerText(buyBox.textContent);
  }

  return null;
}

/**
 * Extract Country of Origin from a parsed product detail page.
 * Searches Amazon's structured product information tables.
 */
export function extractCountryOfOrigin(doc: Document): string | null {
  // Strategy 1: Product Overview table (po-* classes)
  const poOrigin = doc.querySelector("tr.po-country_of_origin td.po-break-word");
  if (poOrigin?.textContent?.trim()) {
    return normalizeCountry(poOrigin.textContent.trim());
  }

  // Strategy 2: Tech specs / detail bullets table rows
  const tableRows = doc.querySelectorAll(
    "#productDetails_techSpec_section_1 tr, " +
    "#productDetails_detailBullets_sections1 tr, " +
    "#productDetails_db_sections tr, " +
    "#detailBulletsWrapper_feature_div tr, " +
    "#prodDetails tr"
  );
  for (const row of tableRows) {
    const header = row.querySelector("th, td:first-child");
    const value = row.querySelector("td:last-child");
    const headerText = header?.textContent?.trim().toLowerCase() ?? "";
    if (
      (headerText === "country of origin" || headerText.includes("country of origin")) &&
      value?.textContent?.trim()
    ) {
      return normalizeCountry(value.textContent.trim());
    }
  }

  // Strategy 3: Detail bullets format (spans with Unicode directional marks)
  const bullets = doc.querySelectorAll("#detailBullets_feature_div li span.a-list-item");
  for (const li of bullets) {
    const text = li.textContent || "";
    const match = text.match(/Country of Origin\s*[:\u200F\u200E]+\s*(.+)/i);
    if (match) return normalizeCountry(match[1].trim());
  }

  // Strategy 4: Additional info section (newer layout)
  const additionalInfo = doc.querySelectorAll(
    "#productDetails_expanderTables_dep498 tr, " +
    ".prodDetTable tr"
  );
  for (const row of additionalInfo) {
    const header = row.querySelector("th, td:first-child");
    const value = row.querySelector("td:last-child");
    if (
      header?.textContent?.trim().toLowerCase().includes("country of origin") &&
      value?.textContent?.trim()
    ) {
      return normalizeCountry(value.textContent.trim());
    }
  }

  return null;
}

/** Normalize country name: trim whitespace, title-case, standardize common variants. */
function normalizeCountry(raw: string): string {
  // Remove extra whitespace and unicode marks
  let name = raw.replace(/[\u200F\u200E\u00A0]/g, " ").replace(/\s+/g, " ").trim();

  // Standardize common variants
  const COUNTRY_MAP: Record<string, string> = {
    "usa": "United States",
    "u.s.a.": "United States",
    "u.s.a": "United States",
    "u.s.": "United States",
    "us": "United States",
    "united states of america": "United States",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "great britain": "United Kingdom",
    "prc": "China",
    "people's republic of china": "China",
    "p.r.c.": "China",
    "south korea": "South Korea",
    "republic of korea": "South Korea",
    "korea, republic of": "South Korea",
    "taiwan, province of china": "Taiwan",
    "viet nam": "Vietnam",
  };

  const lower = name.toLowerCase();
  if (COUNTRY_MAP[lower]) return COUNTRY_MAP[lower];
  return name;
}

/**
 * Extract multi-buy promotional offers from a product detail page.
 * Amazon surfaces these in various locations: promo sections, buy box, or detail bullets.
 */
export function extractMultiBuyOffer(doc: Document): MultiBuyOffer | null {
  // Regex patterns for quantity-based promotions.
  // Each entry: [pattern, groupIndex] where groupIndex is the capture group for quantity.
  const MULTI_BUY_PATTERNS: [RegExp, number][] = [
    [/buy\s+(\d+)[,\s]+(?:get|save)\s+\d+%?\s*off/i, 1],
    [/buy\s+(\d+)[,\s]+save\s+\$?[\d.]+/i, 1],
    [/(\d+)\s+for\s+\$[\d.]+/i, 1],
    [/save\s+\d+%?\s+when\s+you\s+buy\s+(\d+)/i, 1],
    [/purchase\s+(\d+)\s+or\s+more/i, 1],
    [/quantity\s+discount[:\s]+buy\s+(\d+)/i, 1],
    [/(\d+)\+\s+items?\s+(?:get|save)\s+\d+%/i, 1],
  ];

  /** Try to extract a MultiBuyOffer from a text block. */
  function tryParse(text: string): MultiBuyOffer | null {
    const normalized = text.replace(/\s+/g, " ").trim();
    for (const [pattern, qtyGroup] of MULTI_BUY_PATTERNS) {
      const match = normalized.match(pattern);
      if (match) {
        const qty = parseInt(match[qtyGroup], 10);
        if (qty >= 2 && qty <= 100) {
          // Extract the full phrase around the match for display
          const idx = normalized.toLowerCase().indexOf(match[0].toLowerCase());
          const start = Math.max(0, normalized.lastIndexOf(".", idx) + 1);
          const end = normalized.indexOf(".", idx + match[0].length);
          const sentence = normalized.slice(start, end > 0 ? end : undefined).trim();
          return { text: sentence.slice(0, 80), minQuantity: qty };
        }
      }
    }
    return null;
  }

  // Strategy 1: Promotion/deal sections
  const promoSelectors = [
    "#promoPriceBlockMessage_feature_div",
    "#sopp_feature_div",
    "#tp_feature_div",
    "#promoMessageId",
    '[data-feature-name="promotions"]',
    "#SNS_PromoMessage",
  ];
  for (const sel of promoSelectors) {
    const el = doc.querySelector(sel);
    if (el?.textContent) {
      const result = tryParse(el.textContent);
      if (result) return result;
    }
  }

  // Strategy 2: Buy box area
  const buyBox = doc.querySelector("#ppd, #buyBoxAccordion, #desktop_buybox");
  if (buyBox?.textContent) {
    const result = tryParse(buyBox.textContent);
    if (result) return result;
  }

  // Strategy 3: Detail bullets
  const bullets = doc.querySelector("#detailBullets_feature_div, #detail-bullets");
  if (bullets?.textContent) {
    const result = tryParse(bullets.textContent);
    if (result) return result;
  }

  return null;
}

/**
 * Extract Best Sellers Rank from a product detail page.
 * Amazon shows BSR in product details tables or detail bullets as
 * "#X in Category" or "Best Sellers Rank: #X in Category".
 */
export function extractBsr(doc: Document): BsrInfo | null {
  const BSR_PATTERN = /#([\d,]+)\s+in\s+([A-Za-z][A-Za-z &',()-]+)/;

  // Strategy 1: Product details tables (most common location)
  const tableSelectors = [
    "#productDetails_detailBullets_sections1",
    "#prodDetails",
    "#productDetails_db_sections",
    "#detailBulletsWrapper_feature_div",
  ];
  for (const sel of tableSelectors) {
    const section = doc.querySelector(sel);
    if (!section) continue;
    const rows = section.querySelectorAll("tr, li, span");
    for (const row of rows) {
      const text = row.textContent ?? "";
      if (/best\s*sellers?\s*rank/i.test(text) || /amazon\s*best\s*sellers/i.test(text)) {
        const match = text.match(BSR_PATTERN);
        if (match) {
          return {
            rank: parseInt(match[1].replace(/,/g, ""), 10),
            category: match[2].trim().replace(/\s*\(.*$/, ""),
          };
        }
      }
    }
  }

  // Strategy 2: Detail bullets (older layout)
  const bullets = doc.querySelector("#detailBullets_feature_div, #detail-bullets");
  if (bullets?.textContent) {
    const text = bullets.textContent;
    if (/best\s*sellers?\s*rank/i.test(text)) {
      const match = text.match(BSR_PATTERN);
      if (match) {
        return {
          rank: parseInt(match[1].replace(/,/g, ""), 10),
          category: match[2].trim().replace(/\s*\(.*$/, ""),
        };
      }
    }
  }

  // Strategy 3: Broader page search for BSR text
  const detailSection = doc.querySelector("#detailBulletsWrapper_feature_div, #prodDetails, #ppd");
  if (detailSection?.textContent) {
    const text = detailSection.textContent;
    if (/best\s*sellers?\s*rank/i.test(text)) {
      const match = text.match(BSR_PATTERN);
      if (match) {
        return {
          rank: parseInt(match[1].replace(/,/g, ""), 10),
          category: match[2].trim().replace(/\s*\(.*$/, ""),
        };
      }
    }
  }

  return null;
}

/**
 * Extract "Other sellers" count and min price from a product detail page.
 * Amazon shows this as "New (X) from $Y.YY" or "X new from $Y.YY" etc.
 */
export function extractOtherSellersInfo(doc: Document): { count: number; minPrice: number | null } {
  // Strategy 1: "#olp-upd-new" — "New (5) from $12.99"
  const olpNew = doc.querySelector("#olp-upd-new, #olp-upd-new-used, .olp-text-box");
  if (olpNew?.textContent) {
    const parsed = parseOtherSellersText(olpNew.textContent);
    if (parsed.count > 0) return parsed;
  }

  // Strategy 2: "See All Buying Options" area
  const buyingChoices = doc.querySelector(
    "#buybox-see-all-buying-choices, " +
    "#aod-ingress-bouncer, " +
    "#all-offers-display-scroller"
  );
  if (buyingChoices?.textContent) {
    const parsed = parseOtherSellersText(buyingChoices.textContent);
    if (parsed.count > 0) return parsed;
  }

  // Strategy 3: "#olp_feature_div" — older layout
  const olpFeature = doc.querySelector("#olp_feature_div");
  if (olpFeature?.textContent) {
    const parsed = parseOtherSellersText(olpFeature.textContent);
    if (parsed.count > 0) return parsed;
  }

  // Strategy 4: Any text containing "X new from" pattern on the page
  const allText = doc.querySelector("#ppd, #buyBoxAccordion, #desktop_buybox")?.textContent ?? "";
  if (allText) {
    const parsed = parseOtherSellersText(allText);
    if (parsed.count > 0) return parsed;
  }

  return { count: 0, minPrice: null };
}

function parseOtherSellersText(text: string): { count: number; minPrice: number | null } {
  const normalized = text.replace(/\s+/g, " ").trim();

  // Pattern: "New (5) from $12.99" or "(5) New from $12.99"
  const pattern1 = /(?:new|used)?\s*\((\d+)\)\s*(?:new|used)?\s*from\s*\$([0-9,.]+)/i;
  const match1 = normalized.match(pattern1);
  if (match1) {
    return {
      count: parseInt(match1[1], 10),
      minPrice: parseFloat(match1[2].replace(",", "")),
    };
  }

  // Pattern: "5 new from $12.99" or "12 offers from $9.99"
  const pattern2 = /(\d+)\s+(?:new|used|offers?)\s+from\s+\$([0-9,.]+)/i;
  const match2 = normalized.match(pattern2);
  if (match2) {
    return {
      count: parseInt(match2[1], 10),
      minPrice: parseFloat(match2[2].replace(",", "")),
    };
  }

  return { count: 0, minPrice: null };
}

function parseSellerText(text: string): SellerInfo | null {
  const normalized = text.replace(/\s+/g, " ").trim();

  // "Ships from and sold by Amazon.com"
  if (/ships from and sold by\s+Amazon/i.test(normalized)) {
    return { sellerName: "Amazon.com", fulfillment: "amazon" };
  }

  // "Sold by [Seller] and Fulfilled by Amazon"
  const fbaMatch = normalized.match(
    /sold by\s+(.+?)\s+and\s+fulfilled by\s+Amazon/i
  );
  if (fbaMatch) {
    return { sellerName: fbaMatch[1].trim(), fulfillment: "fba" };
  }

  // "Ships from Amazon" + "Sold by [Seller]"
  if (/ships from\s+Amazon/i.test(normalized)) {
    const soldMatch = normalized.match(/sold by\s+([^.]+)/i);
    const name = soldMatch ? soldMatch[1].trim() : "Unknown Seller";
    return {
      sellerName: name,
      fulfillment: isAmazonSeller(name) ? "amazon" : "fba",
    };
  }

  // "Sold by [Seller]"
  const soldOnly = normalized.match(/sold by\s+([^.]+)/i);
  if (soldOnly) {
    const name = soldOnly[1].trim();
    return {
      sellerName: name,
      fulfillment: isAmazonSeller(name) ? "amazon" : "third-party",
    };
  }

  return null;
}

function classifySeller(soldBy: string, shipsFrom: string): SellerInfo {
  const isSoldByAmazon = isAmazonSeller(soldBy);
  const isShippedByAmazon = isAmazonSeller(shipsFrom);

  if (isSoldByAmazon) {
    return { sellerName: "Amazon.com", fulfillment: "amazon" };
  }

  if (isShippedByAmazon) {
    return { sellerName: soldBy || "Third-party seller", fulfillment: "fba" };
  }

  return {
    sellerName: soldBy || "Third-party seller",
    fulfillment: "third-party",
  };
}

function isAmazonSeller(name: string): boolean {
  const n = name.toLowerCase().trim();
  return n === "amazon.com" || n === "amazon" || n.startsWith("amazon.");
}

/**
 * Create a rate-limited product detail fetcher.
 * Returns both brand and seller from a single fetch.
 */
/** Rate-limited fetcher with idle detection. */
export interface RateLimitedDetailFetcher {
  fetch: (asin: string, departmentId?: string | null) => Promise<ProductDetailResult>;
  isIdle: () => boolean;
}

export function createRateLimitedDetailFetcher(
  maxConcurrent = 3,
  delayMs = 500,
): RateLimitedDetailFetcher {
  let active = 0;
  const queue: Array<{ asin: string; departmentId?: string | null; resolve: (v: ProductDetailResult) => void }> = [];

  async function processNext(): Promise<void> {
    if (active >= maxConcurrent || queue.length === 0) return;

    const item = queue.shift()!;
    active++;

    try {
      const result = await fetchProductDetails(item.asin, item.departmentId);
      item.resolve(result);
    } catch {
      item.resolve({ brand: null, seller: null, countryOfOrigin: null, otherSellersCount: 0, otherSellersMinPrice: null, multiBuyOffer: null, bsr: null, listingCompleteness: null });
    } finally {
      active--;
      if (queue.length > 0) {
        await new Promise<void>((r) => setTimeout(r, delayMs));
        void processNext();
      }
    }
  }

  return {
    fetch: (asin: string, departmentId?: string | null): Promise<ProductDetailResult> => {
      return new Promise((resolve) => {
        queue.push({ asin, departmentId, resolve });
        void processNext();
      });
    },
    isIdle: () => active === 0 && queue.length === 0,
  };
}

/**
 * Create a rate-limited brand-only fetcher (legacy compatibility).
 */
export function createRateLimitedBrandFetcher(
  maxConcurrent = 3,
  delayMs = 500,
): (asin: string) => Promise<string | null> {
  let active = 0;
  const queue: Array<{ asin: string; resolve: (v: string | null) => void }> = [];

  async function processNext(): Promise<void> {
    if (active >= maxConcurrent || queue.length === 0) return;

    const item = queue.shift()!;
    active++;

    try {
      const result = await fetchBrandFromPage(item.asin);
      item.resolve(result);
    } catch {
      item.resolve(null);
    } finally {
      active--;
      if (queue.length > 0) {
        await new Promise<void>((r) => setTimeout(r, delayMs));
        void processNext();
      }
    }
  }

  return (asin: string): Promise<string | null> => {
    return new Promise((resolve) => {
      queue.push({ asin, resolve });
      void processNext();
    });
  };
}
