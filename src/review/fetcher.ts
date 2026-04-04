import type { HistogramData, ProductReviewData, ReviewData, ReviewMedia, ReviewMediaGallery } from "./types";
import { $, $$, REVIEW } from "../selectors";

const TAG = "[BAS]";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REVIEWS = 10;

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------

export function parseHistogram(doc: Document): HistogramData | null {
  const table = $(doc, ...REVIEW.histogram);
  if (!table) return null;

  const rows = table.querySelectorAll("tr");
  if (rows.length === 0) return null;

  const starLabels: (keyof HistogramData)[] = ["five", "four", "three", "two", "one"];
  const percentages: number[] = [];

  for (const row of rows) {
    const link = row.querySelector<HTMLAnchorElement>('a[href*="filterByStar"]');
    if (!link) continue;

    const ariaLabel = row.getAttribute("aria-label") ?? link.getAttribute("aria-label") ?? "";
    let pct = parsePercentage(ariaLabel);

    if (pct === null) {
      // Fall back to text content inside the link/row
      const textEl = link.querySelector(".a-size-base") ?? link;
      pct = parsePercentage(textEl.textContent ?? "");
    }

    percentages.push(pct ?? 0);
  }

  if (percentages.length < 5) return null;

  const histogram: HistogramData = { five: 0, four: 0, three: 0, two: 0, one: 0 };
  for (let i = 0; i < starLabels.length; i++) {
    histogram[starLabels[i]] = percentages[i];
  }
  return histogram;
}

function parsePercentage(text: string): number | null {
  const match = /(\d+)%/.exec(text);
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export function parseReviews(doc: Document): ReviewData[] {
  const reviewEls = $$(doc, ...REVIEW.reviewContainer);
  const reviews: ReviewData[] = [];

  for (const el of reviewEls) {
    if (reviews.length >= MAX_REVIEWS) break;

    const rating = parseReviewRating(el);
    const text = parseReviewText(el);
    const date = parseReviewDate(el);
    const verified = isVerifiedPurchase(el);
    const helpfulVotes = parseHelpfulVotes(el);

    reviews.push({ text, rating, date, verified, helpfulVotes });
  }

  return reviews;
}

function parseReviewRating(el: Element): number {
  const iconAlt =
    $(el, ...REVIEW.reviewRating) as HTMLElement | null;
  if (iconAlt?.textContent) {
    const match = /([\d.]+)\s+out\s+of\s+5/i.exec(iconAlt.textContent);
    if (match) return Number(match[1]);
  }
  return 0;
}

function parseReviewText(el: Element): string {
  const body = $(el, ...REVIEW.reviewBody) as HTMLElement | null;
  return body?.textContent?.trim() ?? "";
}

function parseReviewDate(el: Element): Date {
  const dateEl = $(el, ...REVIEW.reviewDate) as HTMLElement | null;
  if (dateEl?.textContent) {
    // "Reviewed in the United States on January 15, 2024"
    const match = /on\s+(.+)$/i.exec(dateEl.textContent.trim());
    if (match) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  return new Date(0);
}

function isVerifiedPurchase(el: Element): boolean {
  if ($(el, ...REVIEW.verifiedPurchase)) return true;
  const text = el.textContent ?? "";
  return /verified\s+purchase/i.test(text);
}

function parseHelpfulVotes(el: Element): number {
  const helpfulEl = $(el, ...REVIEW.helpfulVotes) as HTMLElement | null;
  if (helpfulEl?.textContent) {
    const match = /([\d,]+)\s+(?:people|person)/i.exec(helpfulEl.textContent);
    if (match) return Number(match[1].replace(/,/g, ""));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Review media (images & videos)
// ---------------------------------------------------------------------------

/**
 * Extract media items from a single review element.
 * Amazon review images appear in `img.review-image-tile` or inside
 * `.review-image-container`, `.cr-lightbox-image-thumbnail` containers.
 * Videos appear in `video` tags or `div[data-hook="review-video-tile"]`.
 */
function parseReviewMediaItems(el: Element, rating: number, verified: boolean): ReviewMedia[] {
  const items: ReviewMedia[] = [];
  const seen = new Set<string>();

  // Strategy 1: review-image-tile (most common)
  const imageTiles = $$(el, ...REVIEW.reviewImages) as HTMLImageElement[];
  for (const img of imageTiles) {
    const thumb = img.src || img.getAttribute("data-src") || "";
    if (!thumb || seen.has(thumb)) continue;
    seen.add(thumb);
    // Amazon thumbnails use _SY88 or similar; replace with larger _SL500
    const full = thumb.replace(/_S[XY]\d+_?/g, "_SL500_");
    items.push({ url: full, thumbnailUrl: thumb, type: "image", reviewRating: rating, verified });
  }

  // Strategy 2: review-image-container links
  const imageLinks = el.querySelectorAll<HTMLAnchorElement>(
    '.review-image-container a[href*="/images/"], a[data-hook="review-image-tile-section"]',
  );
  for (const link of imageLinks) {
    const img = link.querySelector<HTMLImageElement>("img");
    if (!img) continue;
    const thumb = img.src || img.getAttribute("data-src") || "";
    if (!thumb || seen.has(thumb)) continue;
    seen.add(thumb);
    const full = thumb.replace(/_S[XY]\d+_?/g, "_SL500_");
    items.push({ url: full, thumbnailUrl: thumb, type: "image", reviewRating: rating, verified });
  }

  // Strategy 3: generic review images (broader fallback)
  const allImgs = el.querySelectorAll<HTMLImageElement>("img");
  for (const img of allImgs) {
    const src = img.src || img.getAttribute("data-src") || "";
    // Only include Amazon media images (not icons, badges, etc.)
    if (!src || seen.has(src)) continue;
    if (!src.includes("images-amazon.com/images") && !src.includes("m.media-amazon.com/images")) continue;
    // Skip tiny icons (< 50px likely an icon)
    if (img.width > 0 && img.width < 50) continue;
    // Skip common non-review images
    if (src.includes("/icons/") || src.includes("/badge")) continue;
    seen.add(src);
    const full = src.replace(/_S[XY]\d+_?/g, "_SL500_");
    items.push({ url: full, thumbnailUrl: src, type: "image", reviewRating: rating, verified });
  }

  // Strategy 4: video tiles
  const videoTiles = $$(el, ...REVIEW.reviewVideos);
  for (const tile of videoTiles) {
    const videoUrl =
      tile.getAttribute("data-video-url") ||
      (tile instanceof HTMLVideoElement ? tile.src : "") ||
      tile.querySelector<HTMLSourceElement>("source")?.src || "";
    if (!videoUrl || seen.has(videoUrl)) continue;
    seen.add(videoUrl);
    // Try to find a poster/thumbnail
    const poster = tile instanceof HTMLVideoElement
      ? (tile.poster || "")
      : (tile.querySelector<HTMLImageElement>("img")?.src || "");
    items.push({
      url: videoUrl,
      thumbnailUrl: poster || videoUrl,
      type: "video",
      reviewRating: rating,
      verified,
    });
  }

  return items;
}

/**
 * Extract all review media from a parsed document.
 * Scans review elements and collects images/videos.
 */
export function parseReviewMediaGallery(doc: Document): ReviewMediaGallery {
  const reviewEls = $$(doc, ...REVIEW.reviewContainer);
  const allItems: ReviewMedia[] = [];
  let reviewsWithMedia = 0;

  for (const el of reviewEls) {
    const rating = parseReviewRating(el);
    const verified = isVerifiedPurchase(el);
    const items = parseReviewMediaItems(el, rating, verified);
    if (items.length > 0) {
      reviewsWithMedia++;
      allItems.push(...items);
    }
  }

  // Also check for top-level image gallery section (outside individual reviews)
  const topGallery = $(doc, ...REVIEW.mediaGallery);
  if (topGallery) {
    const imgs = topGallery.querySelectorAll<HTMLImageElement>("img");
    const seen = new Set(allItems.map((i) => i.thumbnailUrl));
    for (const img of imgs) {
      const src = img.src || img.getAttribute("data-src") || "";
      if (!src || seen.has(src)) continue;
      if (!src.includes("images-amazon.com") && !src.includes("m.media-amazon.com")) continue;
      seen.add(src);
      const full = src.replace(/_S[XY]\d+_?/g, "_SL500_");
      allItems.push({ url: full, thumbnailUrl: src, type: "image", reviewRating: 0, verified: false });
    }
  }

  return { items: allItems, reviewsWithMedia };
}

// ---------------------------------------------------------------------------
// Total ratings & average rating
// ---------------------------------------------------------------------------

export function parseTotalRatings(doc: Document): number {
  const el = $(doc, ...REVIEW.totalRatings) as HTMLElement | null;
  if (el?.textContent) {
    const match = /([\d,]+)\s+(?:global\s+)?ratings?/i.exec(el.textContent);
    if (match) return Number(match[1].replace(/,/g, ""));
  }
  return 0;
}

export function parseAverageRating(doc: Document): number {
  const ratingText = doc.querySelector<HTMLElement>('span[data-hook="rating-out-of-text"]');
  if (ratingText?.textContent) {
    const match = /([\d.]+)\s+out\s+of\s+5/i.exec(ratingText.textContent);
    if (match) return Number(match[1]);
  }

  const starIcon = doc.querySelector<HTMLElement>('i[data-hook="average-star-rating"]');
  const alt = starIcon?.querySelector<HTMLElement>("span.a-icon-alt");
  if (alt?.textContent) {
    const match = /([\d.]+)\s+out\s+of\s+5/i.exec(alt.textContent);
    if (match) return Number(match[1]);
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

export async function fetchProductReviewData(asin: string): Promise<ProductReviewData> {
  const empty: ProductReviewData = {
    asin,
    histogram: null,
    reviews: [],
    totalRatings: 0,
    averageRating: 0,
  };

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
      console.warn(TAG, `Fetch failed for ${asin}: HTTP ${response.status}`);
      return empty;
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    return {
      asin,
      histogram: parseHistogram(doc),
      reviews: parseReviews(doc),
      totalRatings: parseTotalRatings(doc),
      averageRating: parseAverageRating(doc),
      mediaGallery: parseReviewMediaGallery(doc),
    };
  } catch (err) {
    console.warn(TAG, `Error fetching review data for ${asin}:`, err);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Rate-limited fetcher
// ---------------------------------------------------------------------------

/** Rate-limited fetcher with idle detection. */
export interface RateLimitedFetcher<T> {
  fetch: (asin: string) => Promise<T>;
  isIdle: () => boolean;
}

export function createRateLimitedFetcher(
  maxConcurrent = 2,
  delayMs = 500,
): RateLimitedFetcher<ProductReviewData> {
  let active = 0;
  const queue: Array<{ asin: string; resolve: (v: ProductReviewData) => void }> = [];

  async function processNext(): Promise<void> {
    if (active >= maxConcurrent || queue.length === 0) return;

    const item = queue.shift()!;
    active++;

    try {
      const result = await fetchProductReviewData(item.asin);
      item.resolve(result);
    } catch {
      item.resolve({
        asin: item.asin,
        histogram: null,
        reviews: [],
        totalRatings: 0,
        averageRating: 0,
      });
    } finally {
      active--;
      if (queue.length > 0) {
        await delay(delayMs);
        void processNext();
      }
    }
  }

  function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  return {
    fetch: (asin: string): Promise<ProductReviewData> => {
      return new Promise((resolve) => {
        queue.push({ asin, resolve });
        void processNext();
      });
    },
    isIdle: () => active === 0 && queue.length === 0,
  };
}
