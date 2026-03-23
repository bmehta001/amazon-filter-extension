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

  const { subscribeAndSave } = product;

  // Skip products with no deal signals at all
  if (!listPrice && !coupon && !hasDealBadge && !subscribeAndSave) return null;

  const signals: DealSignal[] = [];
  const manipulationWarnings: string[] = [];
  let totalPoints = 0;

  const fmt = (v: number) => `$${v.toFixed(2)}`;
  const addSignal = (type: DealSignal["type"], description: string, points: number) => {
    signals.push({ type, description, points });
    totalPoints += points;
  };
  const addManipulation = (description: string, warning: string, penalty: number) => {
    addSignal("manipulation", description, penalty);
    manipulationWarnings.push(warning);
  };

  // ── Factor 1: Discount percentage (0-40 points) ──
  let discountPercent = 0;
  if (price != null && listPrice != null && listPrice > price) {
    discountPercent = ((listPrice - price) / listPrice) * 100;
    addSignal("discount", `${Math.round(discountPercent)}% off list price`, Math.min(40, Math.round(discountPercent * 0.8)));
  }

  // ── Factor 2: Coupon value (0-20 points) ──
  let couponPercent = 0;
  if (coupon) {
    if (coupon.type === "percent") {
      couponPercent = coupon.value;
      addSignal("coupon", `${coupon.value}% coupon available`, Math.min(20, Math.round(coupon.value * 0.5)));
    } else if (coupon.type === "amount" && price != null && price > 0 && coupon.value > 0) {
      couponPercent = (coupon.value / (price + coupon.value)) * 100;
      addSignal("coupon", `${fmt(coupon.value)} coupon available`, Math.min(20, Math.round(couponPercent * 0.5)));
    }
  }

  // ── Factor 2b: Subscribe & Save discount (0-15 points) ──
  let snsPercent = 0;
  if (subscribeAndSave != null && subscribeAndSave > 0) {
    snsPercent = subscribeAndSave;
    addSignal("coupon", `${subscribeAndSave}% Subscribe & Save discount`, Math.min(15, Math.round(subscribeAndSave * 0.4)));
  }

  // ── Factor 3: "Limited time deal" badge (+15 points) ──
  if (hasDealBadge) {
    addSignal("deal-badge", "Limited time deal", 15);
  }

  // ── Factor 4: Review trust cross-reference ──
  if (reviewQuality != null && reviewQuality >= 70 && discountPercent >= 15) {
    addSignal("review-trust", "Trusted reviews + significant discount", 10);
  }

  // ── Factor 5: Suspicious discount detection ──
  const hasLargeDiscount = discountPercent >= 40;
  const hasLowReviews = reviewCount < 20;
  const hasLowTrust = reviewQuality != null && reviewQuality < 40;
  const noDealBadge = !hasDealBadge;

  if (hasLargeDiscount && hasLowReviews && noDealBadge) {
    addSignal("suspicious", "Large discount on low-review product without deal badge", -15);
  }

  if (hasLargeDiscount && hasLowTrust) {
    addSignal("suspicious", "Large discount with suspicious reviews", -10);
  }

  // ── Factor 6: Inflated "Was" price detection ──
  if (price != null && listPrice != null && listPrice > price) {
    const markup = listPrice / price;

    if (markup >= 2.5) {
      addManipulation(
        `"Was" price (${fmt(listPrice)}) is ${markup.toFixed(1)}× the current price — likely inflated`,
        `The "Was ${fmt(listPrice)}" reference price is ${markup.toFixed(1)}× higher than the actual price. This product was likely never sold at that price.`,
        -20,
      );
    } else if (markup >= 2.0 && noDealBadge) {
      addManipulation(
        `"Was" price (${fmt(listPrice)}) is ${markup.toFixed(1)}× current price without deal badge`,
        `The "Was ${fmt(listPrice)}" price is ${markup.toFixed(1)}× higher than the sale price, and there's no official deal badge — the reference price may be inflated.`,
        -10,
      );
    }
  }

  // ── Factor 7: Coupon-padded pricing ──
  if (coupon && price != null && listPrice == null && couponPercent >= 30) {
    addManipulation(
      `${Math.round(couponPercent)}% coupon on a product with no list price — base price may be inflated to offset the coupon`,
      `This product has a ${Math.round(couponPercent)}% coupon but no original list price. The base price (${fmt(price)}) may be inflated so the after-coupon price appears like a discount.`,
      -8,
    );
  }

  if (discountPercent >= 20 && couponPercent >= 20) {
    const combinedOff = discountPercent + couponPercent;
    if (combinedOff >= 60) {
      addManipulation(
        `Combined ${Math.round(combinedOff)}% off (${Math.round(discountPercent)}% list + ${Math.round(couponPercent)}% coupon) — unusually high`,
        `This product claims ${Math.round(discountPercent)}% off the list price AND has a ${Math.round(couponPercent)}% coupon — a combined ${Math.round(combinedOff)}% discount is rarely genuine.`,
        -12,
      );
    }
  }

  // ── Factor 8: Historical price cross-reference (watchlist) ──
  if (priceHistory && price != null) {
    const { priceWhenAdded, lastKnownPrice } = priceHistory;
    const referencePrice = lastKnownPrice ?? priceWhenAdded;

    if (referencePrice != null && referencePrice > 0) {
      if (listPrice != null && price > referencePrice * 1.05) {
        addManipulation(
          `Price increased from ${fmt(referencePrice)} to ${fmt(price)} since tracking — "deal" may be artificial`,
          `We've been tracking this product: it was ${fmt(referencePrice)} before, now the "sale" price is ${fmt(price)} — the price was raised before applying the "discount."`,
          -15,
        );
      }

      if (listPrice != null && listPrice > referencePrice * 1.3 && referencePrice > price) {
        const pctOver = Math.round(((listPrice - referencePrice) / referencePrice) * 100);
        addManipulation(
          `"Was" price (${fmt(listPrice)}) exceeds our tracked price (${fmt(referencePrice)}) by ${pctOver}%`,
          `The "Was ${fmt(listPrice)}" price is ${pctOver}% higher than the ${fmt(referencePrice)} we previously tracked — the reference price appears fabricated.`,
          -10,
        );
      }
    }
  }

  // Clamp to 0-100
  totalPoints = Math.max(0, Math.min(100, totalPoints));

  // Compute effective discount (price reduction + coupon + S&S combined multiplicatively)
  const combinedCouponAndSns = couponPercent + snsPercent * (1 - couponPercent / 100);
  const effectiveDiscount = discountPercent >= 99
    ? 99
    : Math.min(99, Math.round(discountPercent + combinedCouponAndSns * (1 - discountPercent / 100)));

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
