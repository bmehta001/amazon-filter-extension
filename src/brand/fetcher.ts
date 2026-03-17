/**
 * Brand fetcher — extracts the definitive brand name from an Amazon product
 * detail page. Used as a fallback when DOM/slug/title extraction fails.
 */

const TAG = "[BAS]";
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch the product detail page and extract the brand name using multiple
 * selector strategies.
 *
 * Returns the brand string or null if extraction fails.
 */
export async function fetchBrandFromPage(asin: string): Promise<string | null> {
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
      console.warn(TAG, `Brand fetch failed for ${asin}: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    return extractBrandFromDocument(doc);
  } catch (err) {
    console.warn(TAG, `Error fetching brand for ${asin}:`, err);
    return null;
  }
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
 * Create a rate-limited brand fetcher.
 * Returns a function that queues ASIN lookups with concurrency + delay control.
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
