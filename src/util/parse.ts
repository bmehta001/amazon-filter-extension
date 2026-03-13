/** Parse a numeric string like "1,234", "12.5K", or "1.2M" into a number. */
export function parseCount(text: string): number {
  if (!text) return 0;
  const cleaned = text.trim().replace(/,/g, "");
  // Handle "1.2K", "3.5M", "1B" style abbreviations
  const abbrMatch = cleaned.match(/^([\d.]+)\s*([kKmMbB])$/);
  if (abbrMatch) {
    const value = parseFloat(abbrMatch[1]);
    const suffix = abbrMatch[2].toLowerCase();
    const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1_000_000_000;
    return Math.round(value * multiplier);
  }
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

/** Parse a rating string like "4.5 out of 5 stars" into a float. */
export function parseRating(text: string): number {
  if (!text) return 0;
  const match = text.match(/([\d.]+)\s*(?:out of|\/)\s*[\d.]+/i);
  if (match) return parseFloat(match[1]);
  // Try just a bare number
  const bare = parseFloat(text.trim());
  return isNaN(bare) ? 0 : bare;
}

/**
 * Parse a price string like "$29.99", "29,99 €", or "₹1,499.00" into a number.
 * Returns null if unparseable.
 */
export function parsePrice(text: string): number | null {
  if (!text) return null;
  // Remove currency symbols and whitespace, normalize comma/dot
  const cleaned = text.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;

  // Handle European format "1.234,56" vs US "1,234.56"
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized: string;
  if (lastComma > lastDot) {
    // European: comma is decimal separator
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // US/standard: dot is decimal separator
    normalized = cleaned.replace(/,/g, "");
  }

  const price = parseFloat(normalized);
  return isNaN(price) ? null : price;
}

/**
 * Extract ASIN from an Amazon URL or data attribute.
 * ASIN is a 10-character alphanumeric identifier.
 */
export function extractAsin(urlOrText: string): string | null {
  if (!urlOrText) return null;
  // Match /dp/ASIN or /gp/product/ASIN patterns
  const dpMatch = urlOrText.match(
    /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i,
  );
  if (dpMatch) return dpMatch[1].toUpperCase();
  // Match bare ASIN (exactly 10 alphanumeric chars)
  const bareMatch = urlOrText.match(/\b([A-Z0-9]{10})\b/i);
  if (bareMatch) return bareMatch[1].toUpperCase();
  return null;
}
