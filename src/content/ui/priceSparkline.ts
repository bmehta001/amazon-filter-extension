/**
 * Price history sparkline — embeds a Keepa price history graph image
 * on each search result card next to the price.
 *
 * Uses Keepa's free graph image endpoint (no API key required):
 * https://graph.keepa.com/pricehistory.png?asin={ASIN}&domain=com
 */

/** CSS styles for the sparkline container. */
export const PRICE_SPARKLINE_STYLES = `
  .bas-sparkline {
    display: inline-block;
    vertical-align: middle;
    margin-left: 6px;
    cursor: pointer;
    border: 1px solid #d5d9d9;
    border-radius: 3px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .bas-sparkline:hover {
    border-color: #007185;
  }
  .bas-sparkline img {
    display: block;
    width: 100px;
    height: 30px;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.3s;
  }
  .bas-sparkline img.bas-sparkline--loaded {
    opacity: 1;
  }
  .bas-sparkline--error {
    display: none !important;
  }
`;

/** Map Amazon domain to Keepa domain code. */
const KEEPA_DOMAINS: Record<string, string> = {
  "www.amazon.com": "com",
  "www.amazon.co.uk": "co.uk",
  "www.amazon.de": "de",
  "www.amazon.fr": "fr",
  "www.amazon.co.jp": "co.jp",
  "www.amazon.ca": "ca",
  "www.amazon.it": "it",
  "www.amazon.es": "es",
  "www.amazon.in": "in",
  "www.amazon.com.au": "com.au",
};

/**
 * Build the Keepa graph image URL for a given ASIN.
 */
export function buildKeepaGraphUrl(asin: string, hostname?: string): string {
  const domain = KEEPA_DOMAINS[hostname || window.location.hostname] || "com";
  return `https://graph.keepa.com/pricehistory.png?asin=${asin}&domain=${domain}`;
}

/**
 * Build the Keepa product page URL for click-through.
 */
function buildKeepaPageUrl(asin: string, hostname?: string): string {
  const domain = KEEPA_DOMAINS[hostname || window.location.hostname] || "com";
  return `https://keepa.com/#!product/1-${asin}`;
}

/**
 * Inject a price history sparkline on a product card.
 * Places a small Keepa graph image next to the price element.
 */
export function injectPriceSparkline(card: HTMLElement, asin: string): void {
  // Don't inject twice
  if (card.querySelector(".bas-sparkline")) return;

  // Find the price element
  const priceEl =
    card.querySelector("span.a-price") ||
    card.querySelector("[data-a-color='price']");
  if (!priceEl) return;

  const container = document.createElement("a");
  container.className = "bas-sparkline";
  container.href = buildKeepaPageUrl(asin);
  container.target = "_blank";
  container.rel = "noopener";
  container.title = "View price history on Keepa (click to open)";

  const img = document.createElement("img");
  img.alt = "Price history";
  img.loading = "lazy";
  img.src = buildKeepaGraphUrl(asin);

  img.addEventListener("load", () => {
    img.classList.add("bas-sparkline--loaded");
  });

  img.addEventListener("error", () => {
    container.classList.add("bas-sparkline--error");
  });

  container.appendChild(img);

  // Insert after the price element
  priceEl.parentElement?.insertBefore(container, priceEl.nextSibling);
}
