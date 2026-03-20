import type { Product } from "../types";

/** Result of deal quality analysis for a product. */
export interface DealScore {
  /** Overall deal quality score (0-100). */
  score: number;
  /** Human-readable label. */
  label: "Great Deal" | "Good Deal" | "Normal Price" | "Suspicious Discount" | "Inflated Pricing";
  /** Emoji indicator. */
  emoji: string;
  /** Color for UI display. */
  color: string;
  /** Individual signals that contributed to the score. */
  signals: DealSignal[];
  /** Effective discount percentage after all savings. */
  effectiveDiscount: number;
  /** Price manipulation warnings (shown in tooltip). */
  manipulationWarnings: string[];
}

/** A single factor contributing to the deal score. */
export interface DealSignal {
  /** What this signal represents. */
  type: "discount" | "coupon" | "deal-badge" | "review-trust" | "suspicious" | "manipulation";
  /** Human-readable description. */
  description: string;
  /** Points contributed (can be negative for suspicious/manipulation signals). */
  points: number;
}

/** Optional price history for cross-referencing deal claims. */
export interface PriceHistoryContext {
  /** Price when user first saw / added to watchlist. */
  priceWhenAdded?: number;
  /** Most recent tracked price. */
  lastKnownPrice?: number;
  /** ISO timestamp of when tracking began. */
  addedAt?: string;
}

/**
 * Compute a deal quality score for a product based on DOM-extracted signals.
 * Returns null if the product has no deal-related signals (normal full-price item).
 *
 * Enhanced with price manipulation detection:
 * - Inflated "Was" price detection (>2× markup)
 * - Coupon-padded pricing (high base + coupon ≈ normal price)
 * - Extreme discount without deal badge (likely fake reference price)
 * - Historical price cross-reference via watchlist
 */
export function computeDealScore(
  product: Product,
  priceHistory?: PriceHistoryContext,
): DealScore | null {
  const { price, listPrice, coupon, hasDealBadge, reviewCount, reviewQuality } = product;

  // Skip products with no deal signals at all
  if (!listPrice && !coupon && !hasDealBadge) return null;

  const signals: DealSignal[] = [];
  const manipulationWarnings: string[] = [];
  let totalPoints = 0;

  // ── Factor 1: Discount percentage (0-40 points) ──
  let discountPercent = 0;
  if (price != null && listPrice != null && listPrice > price) {
    discountPercent = ((listPrice - price) / listPrice) * 100;
    const discountPoints = Math.min(40, Math.round(discountPercent * 0.8));
    signals.push({
      type: "discount",
      description: `${Math.round(discountPercent)}% off list price`,
      points: discountPoints,
    });
    totalPoints += discountPoints;
  }

  // ── Factor 2: Coupon value (0-20 points) ──
  let couponPercent = 0;
  if (coupon) {
    if (coupon.type === "percent") {
      couponPercent = coupon.value;
      const couponPoints = Math.min(20, Math.round(coupon.value * 0.5));
      signals.push({
        type: "coupon",
        description: `${coupon.value}% coupon available`,
        points: couponPoints,
      });
      totalPoints += couponPoints;
    } else if (coupon.type === "amount" && price != null && price > 0) {
      couponPercent = (coupon.value / (price + coupon.value)) * 100;
      const couponPoints = Math.min(20, Math.round(couponPercent * 0.5));
      signals.push({
        type: "coupon",
        description: `$${coupon.value.toFixed(2)} coupon available`,
        points: couponPoints,
      });
      totalPoints += couponPoints;
    }
  }

  // ── Factor 3: "Limited time deal" badge (+15 points) ──
  if (hasDealBadge) {
    signals.push({
      type: "deal-badge",
      description: "Limited time deal",
      points: 15,
    });
    totalPoints += 15;
  }

  // ── Factor 4: Review trust cross-reference ──
  if (reviewQuality != null && reviewQuality >= 70 && discountPercent >= 15) {
    const bonusPoints = 10;
    signals.push({
      type: "review-trust",
      description: "Trusted reviews + significant discount",
      points: bonusPoints,
    });
    totalPoints += bonusPoints;
  }

  // ── Factor 5: Suspicious discount detection ──
  const hasLargeDiscount = discountPercent >= 40;
  const hasLowReviews = reviewCount < 20;
  const hasLowTrust = reviewQuality != null && reviewQuality < 40;
  const noDealBadge = !hasDealBadge;

  if (hasLargeDiscount && hasLowReviews && noDealBadge) {
    const penalty = -15;
    signals.push({
      type: "suspicious",
      description: "Large discount on low-review product without deal badge",
      points: penalty,
    });
    totalPoints += penalty;
  }

  if (hasLargeDiscount && hasLowTrust) {
    const penalty = -10;
    signals.push({
      type: "suspicious",
      description: "Large discount with suspicious reviews",
      points: penalty,
    });
    totalPoints += penalty;
  }

  // ── Factor 6: Inflated "Was" price detection ──
  if (price != null && listPrice != null && listPrice > price) {
    const markup = listPrice / price;

    // "Was" price more than 2.5× current → almost certainly inflated
    if (markup >= 2.5) {
      const penalty = -20;
      signals.push({
        type: "manipulation",
        description: `"Was" price ($${listPrice.toFixed(2)}) is ${markup.toFixed(1)}× the current price — likely inflated`,
        points: penalty,
      });
      totalPoints += penalty;
      manipulationWarnings.push(
        `The "Was $${listPrice.toFixed(2)}" reference price is ${markup.toFixed(1)}× higher than the actual price. This product was likely never sold at that price.`,
      );
    }
    // 2× is borderline — flag but lighter penalty
    else if (markup >= 2.0 && noDealBadge) {
      const penalty = -10;
      signals.push({
        type: "manipulation",
        description: `"Was" price ($${listPrice.toFixed(2)}) is ${markup.toFixed(1)}× current price without deal badge`,
        points: penalty,
      });
      totalPoints += penalty;
      manipulationWarnings.push(
        `The "Was $${listPrice.toFixed(2)}" price is ${markup.toFixed(1)}× higher than the sale price, and there's no official deal badge — the reference price may be inflated.`,
      );
    }
  }

  // ── Factor 7: Coupon-padded pricing ──
  // Pattern: seller inflates base price, then offers a large coupon to make
  // the "final" price look like a deal. The after-coupon price is the real price.
  if (coupon && price != null && listPrice == null && couponPercent >= 30) {
    // Big coupon but no list price → the "current" price IS the inflated price
    const penalty = -8;
    signals.push({
      type: "manipulation",
      description: `${Math.round(couponPercent)}% coupon on a product with no list price — base price may be inflated to offset the coupon`,
      points: penalty,
    });
    totalPoints += penalty;
    manipulationWarnings.push(
      `This product has a ${Math.round(couponPercent)}% coupon but no original list price. The base price ($${price.toFixed(2)}) may be inflated so the after-coupon price appears like a discount.`,
    );
  }

  // Double-dipping: large list-price discount AND large coupon
  if (discountPercent >= 20 && couponPercent >= 20) {
    const combinedOff = discountPercent + couponPercent;
    if (combinedOff >= 60) {
      const penalty = -12;
      signals.push({
        type: "manipulation",
        description: `Combined ${Math.round(combinedOff)}% off (${Math.round(discountPercent)}% list + ${Math.round(couponPercent)}% coupon) — unusually high`,
        points: penalty,
      });
      totalPoints += penalty;
      manipulationWarnings.push(
        `This product claims ${Math.round(discountPercent)}% off the list price AND has a ${Math.round(couponPercent)}% coupon — a combined ${Math.round(combinedOff)}% discount is rarely genuine.`,
      );
    }
  }

  // ── Factor 8: Historical price cross-reference (watchlist) ──
  if (priceHistory && price != null) {
    const { priceWhenAdded, lastKnownPrice } = priceHistory;
    const referencePrice = lastKnownPrice ?? priceWhenAdded;

    if (referencePrice != null && referencePrice > 0) {
      // Price went UP since we started tracking, but now claims a "deal"
      if (listPrice != null && price > referencePrice * 1.05) {
        const penalty = -15;
        signals.push({
          type: "manipulation",
          description: `Price increased from $${referencePrice.toFixed(2)} to $${price.toFixed(2)} since tracking — "deal" may be artificial`,
          points: penalty,
        });
        totalPoints += penalty;
        manipulationWarnings.push(
          `We've been tracking this product: it was $${referencePrice.toFixed(2)} before, now the "sale" price is $${price.toFixed(2)} — the price was raised before applying the "discount."`,
        );
      }

      // "Was" price lower than what we actually tracked → definitely inflated
      if (listPrice != null && listPrice > referencePrice * 1.3 && referencePrice > price) {
        const penalty = -10;
        signals.push({
          type: "manipulation",
          description: `"Was" price ($${listPrice.toFixed(2)}) exceeds our tracked price ($${referencePrice.toFixed(2)}) by ${Math.round(((listPrice - referencePrice) / referencePrice) * 100)}%`,
          points: penalty,
        });
        totalPoints += penalty;
        manipulationWarnings.push(
          `The "Was $${listPrice.toFixed(2)}" price is ${Math.round(((listPrice - referencePrice) / referencePrice) * 100)}% higher than the $${referencePrice.toFixed(2)} we previously tracked — the reference price appears fabricated.`,
        );
      }
    }
  }

  // Clamp to 0-100
  totalPoints = Math.max(0, Math.min(100, totalPoints));

  // Compute effective discount (price reduction + coupon combined multiplicatively)
  const effectiveDiscount = discountPercent >= 99
    ? 99
    : Math.min(99, Math.round(discountPercent + couponPercent * (1 - discountPercent / 100)));

  // Determine label and color
  const { label, emoji, color } = scoreToLabel(totalPoints, signals);

  return {
    score: totalPoints,
    label,
    emoji,
    color,
    signals,
    effectiveDiscount,
    manipulationWarnings,
  };
}

function scoreToLabel(
  score: number,
  signals: DealSignal[],
): { label: DealScore["label"]; emoji: string; color: string } {
  const hasManipulation = signals.some((s) => s.type === "manipulation");
  const hasSuspicious = signals.some((s) => s.type === "suspicious");

  if (hasManipulation && score < 25) {
    return { label: "Inflated Pricing", emoji: "⚠️", color: "#cc0c39" };
  }
  if ((hasSuspicious || hasManipulation) && score < 20) {
    return { label: "Suspicious Discount", emoji: "🔴", color: "#cc0c39" };
  }
  if (score >= 60) {
    return { label: "Great Deal", emoji: "🟢", color: "#067d62" };
  }
  if (score >= 35) {
    return { label: "Good Deal", emoji: "🟡", color: "#b07c0a" };
  }
  return { label: "Normal Price", emoji: "⚪", color: "#565959" };
}
