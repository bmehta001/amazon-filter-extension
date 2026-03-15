/**
 * Build a CamelCamelCamel URL for the given ASIN.
 * Falls back to a search URL using the product title, or the CCC homepage.
 */
export function buildCccUrl(
  asin: string | null,
  title?: string,
): string {
  if (asin) {
    return `https://camelcamelcamel.com/product/${asin}`;
  }
  if (title) {
    return `https://camelcamelcamel.com/search?sq=${encodeURIComponent(title)}`;
  }
  return "https://camelcamelcamel.com";
}

/** Check if the current URL is an Amazon search results page. */
export function isAmazonSearchPage(url: string = location.href): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.match(/^www\.amazon\./) !== null &&
      (parsed.pathname.startsWith("/s") ||
        parsed.pathname.includes("/search"))
    );
  } catch {
    return false;
  }
}

/** Check if the current URL is an Amazon Haul page. */
export function isAmazonHaulPage(url: string = location.href): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.match(/^www\.amazon\./) !== null &&
      parsed.pathname.startsWith("/haul")
    );
  } catch {
    return false;
  }
}

/** Check if the current URL is any supported Amazon page (search or Haul). */
export function isAmazonSupportedPage(url: string = location.href): boolean {
  return isAmazonSearchPage(url) || isAmazonHaulPage(url);
}

/** Extract the current search query from the Amazon URL. */
export function getSearchQuery(url: string = location.href): string {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("k") || "";
  } catch {
    return "";
  }
}

/**
 * Build a URL with sort-by-review-count applied.
 * Amazon uses &s=review-count-rank for this.
 */
export function buildSortByReviewsUrl(
  url: string = location.href,
): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("s", "review-count-rank");
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Build a URL filtered to Amazon-only sellers.
 * Amazon's own seller ID is ATVPDKIKX0DER.
 */
export function buildAmazonOnlyUrl(
  url: string = location.href,
): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("emi", "ATVPDKIKX0DER");
    return parsed.toString();
  } catch {
    return url;
  }
}
