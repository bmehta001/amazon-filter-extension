import type { HistogramData, ProductReviewData, ReviewData } from "./types";

const TAG = "[BAS]";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REVIEWS = 10;

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------

export function parseHistogram(doc: Document): HistogramData | null {
  const table = doc.querySelector("#histogramTable") ?? doc.querySelector("table#histogramTable");
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
  const reviewEls = doc.querySelectorAll('div[data-hook="review"], div.review');
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
    el.querySelector<HTMLElement>('i[data-hook="review-star-rating"] span.a-icon-alt') ??
    el.querySelector<HTMLElement>("i.review-rating span.a-icon-alt");
  if (iconAlt?.textContent) {
    const match = /([\d.]+)\s+out\s+of\s+5/i.exec(iconAlt.textContent);
    if (match) return Number(match[1]);
  }
  return 0;
}

function parseReviewText(el: Element): string {
  const body =
    el.querySelector<HTMLElement>('span[data-hook="review-body"] span') ??
    el.querySelector<HTMLElement>('span[data-hook="review-body"]');
  return body?.textContent?.trim() ?? "";
}

function parseReviewDate(el: Element): Date {
  const dateEl = el.querySelector<HTMLElement>('span[data-hook="review-date"]');
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
  if (el.querySelector('span[data-hook="avp-badge"]')) return true;
  const text = el.textContent ?? "";
  return /verified\s+purchase/i.test(text);
}

function parseHelpfulVotes(el: Element): number {
  const helpfulEl = el.querySelector<HTMLElement>('span[data-hook="helpful-vote-statement"]');
  if (helpfulEl?.textContent) {
    const match = /([\d,]+)\s+(?:people|person)/i.exec(helpfulEl.textContent);
    if (match) return Number(match[1].replace(/,/g, ""));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Total ratings & average rating
// ---------------------------------------------------------------------------

export function parseTotalRatings(doc: Document): number {
  const el =
    doc.querySelector<HTMLElement>('span[data-hook="total-review-count"]') ??
    doc.querySelector<HTMLElement>("#acrCustomerReviewText");
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
    };
  } catch (err) {
    console.warn(TAG, `Error fetching review data for ${asin}:`, err);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Rate-limited fetcher
// ---------------------------------------------------------------------------

export function createRateLimitedFetcher(
  maxConcurrent = 2,
  delayMs = 500,
): (asin: string) => Promise<ProductReviewData> {
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
      // fetchProductReviewData already handles errors internally
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

  return (asin: string): Promise<ProductReviewData> => {
    return new Promise((resolve) => {
      queue.push({ asin, resolve });
      void processNext();
    });
  };
}
