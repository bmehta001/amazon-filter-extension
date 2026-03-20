/**
 * Seller Trust Signals — analyzes seller metadata to detect counterfeit risk,
 * unreliable sellers, and suspicious selling patterns.
 *
 * Signals computed purely from data already available (no extra network calls):
 * 1. Fulfillment type (Amazon vs FBA vs third-party)
 * 2. Brand-seller mismatch (brand name differs from seller name)
 * 3. Seller name red flags (gibberish, excessive punctuation, very long)
 * 4. Review-price anomaly (cheap product + massive reviews = dropship risk)
 */

import type { Product, SellerInfo } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SellerTrustSignal {
  id: string;
  name: string;
  /** Points added to trust (positive = good, negative = bad). */
  points: number;
  /** Maximum absolute points for this signal. */
  maxPoints: number;
  reason: string;
  severity: "none" | "low" | "medium" | "high";
}

export interface SellerTrustResult {
  /** Composite seller trust score 0-100. */
  score: number;
  /** Human-readable label. */
  label: "trusted" | "neutral" | "caution" | "risky";
  /** Color for UI. */
  color: "green" | "gray" | "orange" | "red";
  /** All computed signals. */
  signals: SellerTrustSignal[];
  /** Quick summary line for tooltip. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Signal: Fulfillment Type
// ---------------------------------------------------------------------------

/**
 * Amazon-fulfilled products are lower counterfeit risk.
 * Direct Amazon = best, FBA = good, third-party = higher risk.
 */
export function analyzeFulfillment(seller: SellerInfo): SellerTrustSignal {
  const f = seller.fulfillment;

  if (f === "amazon") {
    return {
      id: "fulfillment",
      name: "Fulfillment type",
      points: 25,
      maxPoints: 25,
      reason: "Sold and shipped by Amazon.com — lowest counterfeit risk",
      severity: "none",
    };
  }

  if (f === "fba") {
    return {
      id: "fulfillment",
      name: "Fulfillment type",
      points: 10,
      maxPoints: 25,
      reason: `Sold by ${seller.sellerName}, fulfilled by Amazon (FBA) — Amazon handles shipping/returns`,
      severity: "low",
    };
  }

  // third-party or unknown
  return {
    id: "fulfillment",
    name: "Fulfillment type",
    points: -10,
    maxPoints: 25,
    reason: `Sold and shipped by third-party seller "${seller.sellerName}" — higher counterfeit risk`,
    severity: "medium",
  };
}

// ---------------------------------------------------------------------------
// Signal: Brand-Seller Mismatch
// ---------------------------------------------------------------------------

/**
 * When a product's brand name doesn't appear in the seller name,
 * it could indicate a reseller or counterfeit risk.
 */
export function analyzeBrandSellerMatch(
  seller: SellerInfo,
  brand: string,
): SellerTrustSignal {
  if (!brand || brand.length < 2) {
    return {
      id: "brand-match",
      name: "Brand-seller match",
      points: 0,
      maxPoints: 15,
      reason: "Brand unknown — cannot verify seller-brand relationship",
      severity: "none",
    };
  }

  const sellerLower = seller.sellerName.toLowerCase();
  const brandLower = brand.toLowerCase();

  if (isAmazonSeller(seller)) {
    return {
      id: "brand-match",
      name: "Brand-seller match",
      points: 10,
      maxPoints: 15,
      reason: "Sold by Amazon — authorized distribution",
      severity: "none",
    };
  }

  // Check if seller name contains brand or vice versa
  if (sellerLower.includes(brandLower) || brandLower.includes(sellerLower)) {
    return {
      id: "brand-match",
      name: "Brand-seller match",
      points: 15,
      maxPoints: 15,
      reason: `Seller "${seller.sellerName}" matches brand "${brand}" — likely authorized`,
      severity: "none",
    };
  }

  // Mismatch
  return {
    id: "brand-match",
    name: "Brand-seller match",
    points: -5,
    maxPoints: 15,
    reason: `Seller "${seller.sellerName}" differs from brand "${brand}" — may be a reseller`,
    severity: "low",
  };
}

// ---------------------------------------------------------------------------
// Signal: Seller Name Quality
// ---------------------------------------------------------------------------

const RANDOM_ALPHANUM = /^(?=.*\d)[a-z0-9]{10,}$/i;
const GIBBERISH_PATTERN = /^[a-z]{13,}$/i;
const EXCESSIVE_CAPS_PATTERN = /^[A-Z\s]{11,}$/;

/**
 * Suspicious seller names: gibberish strings, auto-generated names,
 * very short/empty names.
 */
export function analyzeSellerName(seller: SellerInfo): SellerTrustSignal {
  if (isAmazonSeller(seller)) {
    return {
      id: "seller-name",
      name: "Seller name quality",
      points: 5,
      maxPoints: 10,
      reason: "Amazon.com is a verified seller",
      severity: "none",
    };
  }

  const name = seller.sellerName.trim();

  if (name.length <= 2) {
    return {
      id: "seller-name",
      name: "Seller name quality",
      points: -8,
      maxPoints: 10,
      reason: `Seller name "${name}" is unusually short — may be a placeholder`,
      severity: "medium",
    };
  }

  if (RANDOM_ALPHANUM.test(name) && !/\s/.test(name)) {
    return {
      id: "seller-name",
      name: "Seller name quality",
      points: -10,
      maxPoints: 10,
      reason: `Seller name "${name}" appears auto-generated — higher fraud risk`,
      severity: "high",
    };
  }

  if (GIBBERISH_PATTERN.test(name)) {
    return {
      id: "seller-name",
      name: "Seller name quality",
      points: -6,
      maxPoints: 10,
      reason: `Seller name "${name}" appears unusual — single long word with no spaces`,
      severity: "medium",
    };
  }

  if (EXCESSIVE_CAPS_PATTERN.test(name)) {
    return {
      id: "seller-name",
      name: "Seller name quality",
      points: -3,
      maxPoints: 10,
      reason: `Seller name "${name}" is all caps — minor red flag`,
      severity: "low",
    };
  }

  return {
    id: "seller-name",
    name: "Seller name quality",
    points: 5,
    maxPoints: 10,
    reason: `Seller "${name}" has a legitimate-looking business name`,
    severity: "none",
  };
}

// ---------------------------------------------------------------------------
// Signal: Review Count vs Price Anomaly
// ---------------------------------------------------------------------------

/**
 * Very cheap products with extremely high review counts can indicate
 * dropshipping or review manipulation schemes.
 */
export function analyzeReviewPriceAnomaly(
  product: Pick<Product, "price" | "reviewCount">,
): SellerTrustSignal {
  const { price, reviewCount } = product;

  if (price == null || price <= 0 || reviewCount < 100) {
    return {
      id: "review-price",
      name: "Review-price anomaly",
      points: 0,
      maxPoints: 10,
      reason: "Insufficient data for review-price analysis",
      severity: "none",
    };
  }

  const ratio = reviewCount / price;

  if (price < 10 && ratio > 2000) {
    return {
      id: "review-price",
      name: "Review-price anomaly",
      points: -8,
      maxPoints: 10,
      reason: `${reviewCount.toLocaleString()} reviews on a $${price.toFixed(2)} product is extremely unusual — possible review manipulation`,
      severity: "high",
    };
  }

  if (price < 15 && ratio > 500) {
    return {
      id: "review-price",
      name: "Review-price anomaly",
      points: -4,
      maxPoints: 10,
      reason: `${reviewCount.toLocaleString()} reviews on a $${price.toFixed(2)} product is unusually high`,
      severity: "low",
    };
  }

  return {
    id: "review-price",
    name: "Review-price anomaly",
    points: 0,
    maxPoints: 10,
    reason: "Review count is proportional to price point",
    severity: "none",
  };
}

// ---------------------------------------------------------------------------
// Composite Score
// ---------------------------------------------------------------------------

/**
 * Compute a composite seller trust score from all available signals.
 * Returns null if no seller info is available.
 */
export function computeSellerTrust(product: Product): SellerTrustResult | null {
  if (!product.seller) return null;

  const seller = product.seller;
  const signals: SellerTrustSignal[] = [];

  signals.push(analyzeFulfillment(seller));
  signals.push(analyzeBrandSellerMatch(seller, product.brand));
  signals.push(analyzeSellerName(seller));
  signals.push(analyzeReviewPriceAnomaly(product));

  // Baseline 50, add positive, subtract negative → clamp 0-100
  let total = 50;
  for (const s of signals) {
    total += s.points;
  }
  const score = Math.max(0, Math.min(100, total));

  let label: SellerTrustResult["label"];
  let color: SellerTrustResult["color"];

  if (score >= 70) {
    label = "trusted";
    color = "green";
  } else if (score >= 45) {
    label = "neutral";
    color = "gray";
  } else if (score >= 25) {
    label = "caution";
    color = "orange";
  } else {
    label = "risky";
    color = "red";
  }

  return { score, label, color, signals, summary: buildSummary(seller, label, score) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAmazonSeller(seller: SellerInfo): boolean {
  const name = seller.sellerName.toLowerCase().trim();
  return name === "amazon.com" || name === "amazon" || /^amazon\.\w+$/.test(name);
}

function buildSummary(
  seller: SellerInfo,
  label: SellerTrustResult["label"],
  score: number,
): string {
  const name = seller.sellerName;
  switch (label) {
    case "trusted":
      return `Sold by ${name} — trusted seller (${score}/100)`;
    case "neutral":
      return `Sold by ${name} (${score}/100)`;
    case "caution":
      return `Sold by ${name} — exercise caution (${score}/100)`;
    case "risky":
      return `Sold by ${name} — high risk seller (${score}/100)`;
  }
}
