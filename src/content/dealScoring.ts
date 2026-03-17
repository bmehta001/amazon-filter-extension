import type { Product } from "../types";

/** Result of deal quality analysis for a product. */
export interface DealScore {
  /** Overall deal quality score (0-100). */
  score: number;
  /** Human-readable label. */
  label: "Great Deal" | "Good Deal" | "Normal Price" | "Suspicious Discount";
  /** Emoji indicator. */
  emoji: string;
  /** Color for UI display. */
  color: string;
  /** Individual signals that contributed to the score. */
  signals: DealSignal[];
  /** Effective discount percentage after all savings. */
  effectiveDiscount: number;
}

/** A single factor contributing to the deal score. */
export interface DealSignal {
  /** What this signal represents. */
  type: "discount" | "coupon" | "deal-badge" | "review-trust" | "suspicious";
  /** Human-readable description. */
  description: string;
  /** Points contributed (can be negative for suspicious signals). */
  points: number;
}

/**
 * Compute a deal quality score for a product based on DOM-extracted signals.
 * Returns null if the product has no deal-related signals (normal full-price item).
 */
export function computeDealScore(product: Product): DealScore | null {
  const { price, listPrice, coupon, hasDealBadge, reviewCount, reviewQuality } = product;

  // Skip products with no deal signals at all
  if (!listPrice && !coupon && !hasDealBadge) return null;

  const signals: DealSignal[] = [];
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
    // High trust reviews + real discount = likely genuine deal
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

  // Clamp to 0-100
  totalPoints = Math.max(0, Math.min(100, totalPoints));

  // Compute effective discount (price reduction + coupon combined)
  const effectiveDiscount = Math.min(
    99,
    Math.round(discountPercent + couponPercent * (1 - discountPercent / 100)),
  );

  // Determine label and color
  const { label, emoji, color } = scoreToLabel(totalPoints, signals);

  return {
    score: totalPoints,
    label,
    emoji,
    color,
    signals,
    effectiveDiscount,
  };
}

function scoreToLabel(
  score: number,
  signals: DealSignal[],
): { label: DealScore["label"]; emoji: string; color: string } {
  const hasSuspicious = signals.some((s) => s.type === "suspicious");

  if (hasSuspicious && score < 20) {
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
