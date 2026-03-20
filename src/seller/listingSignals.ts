/**
 * Listing Hijack / Manipulation Detection
 *
 * Detects suspicious patterns that indicate a product listing may have been
 * hijacked by an unauthorized seller, or that the listing is being manipulated.
 *
 * Signals (computed from data already available — no extra fetches):
 * 1. Multi-seller presence analysis (many sellers = healthy; one random seller = suspicious)
 * 2. Brand-listing mismatch (seller doesn't match the listing's brand)
 * 3. Established listing with new/unknown seller (thousands of reviews but sketchy seller)
 * 4. Price undercut anomaly (seller price much lower than other sellers = counterfeit risk)
 */

import type { Product, SellerInfo } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListingSignal {
  id: string;
  name: string;
  /** Positive = reassuring, negative = suspicious. */
  points: number;
  maxPoints: number;
  reason: string;
  severity: "none" | "low" | "medium" | "high";
}

export interface ListingIntegrityResult {
  /** Composite listing integrity score 0-100 (100 = no concerns). */
  score: number;
  /** Human-readable label. */
  label: "verified" | "normal" | "warning" | "alert";
  /** Color for UI. */
  color: "green" | "gray" | "orange" | "red";
  /** All computed signals. */
  signals: ListingSignal[];
  /** Short summary for tooltip. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Signal 1: Multi-Seller Analysis
// ---------------------------------------------------------------------------

/**
 * Multiple sellers on a listing is generally healthy (validates demand).
 * But a single unknown third-party seller on a well-known brand is suspicious.
 */
export function analyzeSellerCount(
  seller: SellerInfo,
  brand: string,
): ListingSignal {
  const count = seller.otherSellersCount ?? 0;
  const isAmazon = isAmazonSeller(seller);

  // Amazon is primary seller — other sellers don't matter much
  if (isAmazon) {
    return {
      id: "seller-count",
      name: "Marketplace presence",
      points: 15,
      maxPoints: 15,
      reason: count > 0
        ? `Sold by Amazon with ${count} other seller(s) — healthy marketplace`
        : "Sold directly by Amazon",
      severity: "none",
    };
  }

  // Multiple sellers = validated demand
  if (count >= 3) {
    return {
      id: "seller-count",
      name: "Marketplace presence",
      points: 10,
      maxPoints: 15,
      reason: `${count + 1} sellers offer this product — competitive marketplace`,
      severity: "none",
    };
  }

  // Single third-party seller with a recognizable brand = potential hijack
  if (count === 0 && brand && brand.length > 2 && !sellerMatchesBrand(seller, brand)) {
    return {
      id: "seller-count",
      name: "Marketplace presence",
      points: -10,
      maxPoints: 15,
      reason: `Only seller for "${brand}" product — no other sellers to validate authenticity`,
      severity: "medium",
    };
  }

  // Few sellers, but at least some competition
  return {
    id: "seller-count",
    name: "Marketplace presence",
    points: 0,
    maxPoints: 15,
    reason: count > 0
      ? `${count + 1} sellers on this listing`
      : "Single seller on this listing",
    severity: count === 0 ? "low" : "none",
  };
}

// ---------------------------------------------------------------------------
// Signal 2: Brand-Listing Mismatch (Hijack Indicator)
// ---------------------------------------------------------------------------

/**
 * A third-party seller on a brand's listing who clearly doesn't represent
 * the brand is a classic listing hijack pattern.
 * E.g., "Samsung Galaxy Buds" sold by "XYZ Electronics Wholesale"
 */
export function analyzeBrandListingMatch(
  seller: SellerInfo,
  brand: string,
  reviewCount: number,
): ListingSignal {
  if (isAmazonSeller(seller) || !brand || brand.length < 2) {
    return {
      id: "brand-listing",
      name: "Brand-listing alignment",
      points: 5,
      maxPoints: 15,
      reason: isAmazonSeller(seller)
        ? "Amazon is an authorized distributor"
        : "Brand unknown — cannot assess listing alignment",
      severity: "none",
    };
  }

  const matches = sellerMatchesBrand(seller, brand);

  if (matches) {
    return {
      id: "brand-listing",
      name: "Brand-listing alignment",
      points: 15,
      maxPoints: 15,
      reason: `Seller "${seller.sellerName}" appears to be the brand owner or authorized dealer`,
      severity: "none",
    };
  }

  // Mismatch is more suspicious on established listings with many reviews
  if (reviewCount >= 1000) {
    return {
      id: "brand-listing",
      name: "Brand-listing alignment",
      points: -12,
      maxPoints: 15,
      reason: `Third-party seller "${seller.sellerName}" on an established "${brand}" listing (${reviewCount.toLocaleString()} reviews) — possible listing hijack`,
      severity: "high",
    };
  }

  if (reviewCount >= 100) {
    return {
      id: "brand-listing",
      name: "Brand-listing alignment",
      points: -6,
      maxPoints: 15,
      reason: `Seller "${seller.sellerName}" doesn't match brand "${brand}" on a popular listing`,
      severity: "medium",
    };
  }

  return {
    id: "brand-listing",
    name: "Brand-listing alignment",
    points: -3,
    maxPoints: 15,
    reason: `Seller "${seller.sellerName}" differs from listing brand "${brand}"`,
    severity: "low",
  };
}

// ---------------------------------------------------------------------------
// Signal 3: Price Undercut Anomaly
// ---------------------------------------------------------------------------

/**
 * If the current seller's price is significantly below other sellers' minimum,
 * the product may be counterfeit or a bait-and-switch.
 */
export function analyzePriceUndercut(
  product: Pick<Product, "price" | "seller">,
): ListingSignal {
  const seller = product.seller;
  if (!seller || product.price == null || product.price <= 0) {
    return {
      id: "price-undercut",
      name: "Price anomaly",
      points: 0,
      maxPoints: 10,
      reason: "Insufficient price data for comparison",
      severity: "none",
    };
  }

  const minOtherPrice = seller.otherSellersMinPrice;
  if (minOtherPrice == null || minOtherPrice <= 0) {
    return {
      id: "price-undercut",
      name: "Price anomaly",
      points: 0,
      maxPoints: 10,
      reason: "No other seller prices available for comparison",
      severity: "none",
    };
  }

  const priceDiff = (minOtherPrice - product.price) / minOtherPrice;

  // Current price WAY below other sellers (>40% cheaper)
  if (priceDiff > 0.4 && !isAmazonSeller(seller)) {
    return {
      id: "price-undercut",
      name: "Price anomaly",
      points: -10,
      maxPoints: 10,
      reason: `Price $${product.price.toFixed(2)} is ${Math.round(priceDiff * 100)}% below next cheapest seller ($${minOtherPrice.toFixed(2)}) — possible counterfeit or bait-and-switch`,
      severity: "high",
    };
  }

  // Moderately below (>20% cheaper)
  if (priceDiff > 0.2 && !isAmazonSeller(seller)) {
    return {
      id: "price-undercut",
      name: "Price anomaly",
      points: -4,
      maxPoints: 10,
      reason: `Price is ${Math.round(priceDiff * 100)}% below other sellers — may warrant verification`,
      severity: "low",
    };
  }

  // Price is competitive or higher — fine
  return {
    id: "price-undercut",
    name: "Price anomaly",
    points: priceDiff < -0.1 ? 5 : 0, // Premium pricing = reassuring
    maxPoints: 10,
    reason: "Price is in line with other sellers",
    severity: "none",
  };
}

// ---------------------------------------------------------------------------
// Signal 4: Fulfillment Risk for High-Value Brands
// ---------------------------------------------------------------------------

/**
 * Third-party fulfillment on a premium brand is higher risk than
 * third-party fulfillment on a generic/unknown brand.
 */
export function analyzeFulfillmentRisk(
  seller: SellerInfo,
  brand: string,
  price: number | null,
): ListingSignal {
  if (seller.fulfillment === "amazon" || seller.fulfillment === "fba") {
    return {
      id: "fulfillment-risk",
      name: "Fulfillment risk",
      points: 10,
      maxPoints: 10,
      reason: seller.fulfillment === "amazon"
        ? "Amazon handles fulfillment — lowest counterfeit risk"
        : "Fulfilled by Amazon — inventory inspected at warehouse",
      severity: "none",
    };
  }

  // Third-party + premium brand + high price = elevated risk
  const isPremiumBrand = brand && PREMIUM_BRANDS.has(brand.toLowerCase());
  const isHighValue = price != null && price >= 50;

  if (isPremiumBrand && isHighValue) {
    return {
      id: "fulfillment-risk",
      name: "Fulfillment risk",
      points: -8,
      maxPoints: 10,
      reason: `Third-party shipped "${brand}" product at $${price!.toFixed(2)} — higher counterfeit risk for premium brands`,
      severity: "high",
    };
  }

  if (isPremiumBrand || isHighValue) {
    return {
      id: "fulfillment-risk",
      name: "Fulfillment risk",
      points: -4,
      maxPoints: 10,
      reason: "Third-party fulfillment on a brand-name product — verify seller reputation",
      severity: "medium",
    };
  }

  return {
    id: "fulfillment-risk",
    name: "Fulfillment risk",
    points: 0,
    maxPoints: 10,
    reason: "Third-party fulfillment",
    severity: "low",
  };
}

// Well-known brands where counterfeits are common
const PREMIUM_BRANDS = new Set([
  "apple", "samsung", "sony", "bose", "nike", "adidas", "lego",
  "dyson", "nintendo", "playstation", "xbox", "microsoft", "logitech",
  "anker", "beats", "jbl", "north face", "patagonia", "yeti",
  "kitchenaid", "instant pot", "vitamix", "breville", "cuisinart",
  "dewalt", "makita", "milwaukee", "bosch", "stanley",
]);

// ---------------------------------------------------------------------------
// Composite Score
// ---------------------------------------------------------------------------

/**
 * Compute a listing integrity score that detects potential hijacking
 * or manipulation. Returns null if no seller info available.
 */
export function computeListingIntegrity(product: Product): ListingIntegrityResult | null {
  if (!product.seller) return null;

  const seller = product.seller;
  const signals: ListingSignal[] = [];

  signals.push(analyzeSellerCount(seller, product.brand));
  signals.push(analyzeBrandListingMatch(seller, product.brand, product.reviewCount));
  signals.push(analyzePriceUndercut(product));
  signals.push(analyzeFulfillmentRisk(seller, product.brand, product.price));

  // Baseline 50, add/subtract signal points
  let total = 50;
  for (const s of signals) {
    total += s.points;
  }
  const score = Math.max(0, Math.min(100, total));

  let label: ListingIntegrityResult["label"];
  let color: ListingIntegrityResult["color"];

  if (score >= 70) {
    label = "verified";
    color = "green";
  } else if (score >= 45) {
    label = "normal";
    color = "gray";
  } else if (score >= 25) {
    label = "warning";
    color = "orange";
  } else {
    label = "alert";
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

function sellerMatchesBrand(seller: SellerInfo, brand: string): boolean {
  const sellerLower = seller.sellerName.toLowerCase();
  const brandLower = brand.toLowerCase();
  return sellerLower.includes(brandLower) || brandLower.includes(sellerLower);
}

function buildSummary(
  seller: SellerInfo,
  label: ListingIntegrityResult["label"],
  score: number,
): string {
  switch (label) {
    case "verified":
      return `Listing verified — sold by ${seller.sellerName} (${score}/100)`;
    case "normal":
      return `Listing looks normal (${score}/100)`;
    case "warning":
      return `Listing concerns detected — verify seller (${score}/100)`;
    case "alert":
      return `⚠️ Possible listing hijack — exercise extreme caution (${score}/100)`;
  }
}
