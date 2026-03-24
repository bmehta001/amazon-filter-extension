/**
 * Savings stack badge — shows cumulative savings breakdown on product cards.
 *
 * Computes the "effective price" after stacking all available discounts:
 * list price markdown, coupon (percent or dollar), and Subscribe & Save.
 * Renders a compact badge with color-coded savings and a breakdown tooltip.
 */

import type { Product } from "../../types";

// ── Types ────────────────────────────────────────────────────────────

/** A single discount layer in the savings stack. */
export interface SavingsLayer {
  type: "list-discount" | "coupon" | "subscribe-save" | "deal-badge" | "multi-buy";
  label: string;
  /** Percent discount this layer contributes. */
  percent: number;
  /** Dollar amount saved by this layer (computed from percent × remaining price). */
  amount: number;
}

/** Result of computing the full savings stack for a product. */
export interface SavingsStack {
  /** All applicable discount layers. */
  layers: SavingsLayer[];
  /** Total savings percentage (combined multiplicatively, not additive). */
  totalPercent: number;
  /** Total dollar amount saved from original price. */
  totalAmount: number;
  /** Final price after all stacked discounts. */
  effectivePrice: number;
  /** The base price used for calculation (listPrice or price). */
  basePrice: number;
  /** Color tier based on total savings. */
  color: "green" | "amber" | "gray";
}

// ── Computation ──────────────────────────────────────────────────────

/**
 * Compute the savings stack for a product by layering all available discounts.
 * Discounts are applied multiplicatively (each layer reduces the remaining price).
 * Returns null if there are no savings to show.
 */
export function computeSavingsStack(product: Product): SavingsStack | null {
  const { price, listPrice, coupon, subscribeAndSave, hasDealBadge } = product;

  if (price == null || price <= 0) return null;

  const layers: SavingsLayer[] = [];
  const basePrice = listPrice != null && listPrice > price ? listPrice : price;
  let runningPrice = basePrice;

  // Layer 1: List price discount (markdown from "Was" price)
  if (listPrice != null && listPrice > price) {
    const discountPercent = ((listPrice - price) / listPrice) * 100;
    const amount = listPrice - price;
    layers.push({
      type: "list-discount",
      label: `${Math.round(discountPercent)}% off list`,
      percent: discountPercent,
      amount,
    });
    runningPrice = price;
  }

  // Layer 2: Coupon discount (applied to the current running price)
  if (coupon) {
    let couponAmount: number;
    let couponPercent: number;
    if (coupon.type === "percent") {
      couponPercent = coupon.value;
      couponAmount = runningPrice * (coupon.value / 100);
    } else {
      couponAmount = Math.min(coupon.value, runningPrice);
      couponPercent = runningPrice > 0 ? (couponAmount / runningPrice) * 100 : 0;
    }
    if (couponAmount > 0) {
      layers.push({
        type: "coupon",
        label: coupon.type === "percent"
          ? `${coupon.value}% coupon`
          : `$${coupon.value.toFixed(2)} coupon`,
        percent: couponPercent,
        amount: couponAmount,
      });
      runningPrice -= couponAmount;
    }
  }

  // Layer 3: Subscribe & Save discount (applied to remaining price)
  if (subscribeAndSave != null && subscribeAndSave > 0) {
    const snsAmount = runningPrice * (subscribeAndSave / 100);
    if (snsAmount > 0) {
      layers.push({
        type: "subscribe-save",
        label: `${subscribeAndSave}% S&S`,
        percent: subscribeAndSave,
        amount: snsAmount,
      });
      runningPrice -= snsAmount;
    }
  }

  // Layer 4: Deal badge (informational only — no additional price reduction)
  if (hasDealBadge) {
    layers.push({
      type: "deal-badge",
      label: "Limited deal",
      percent: 0,
      amount: 0,
    });
  }

  // Layer 5: Multi-buy offer (informational only — from detail page)
  if (product.multiBuyOffer) {
    layers.push({
      type: "multi-buy",
      label: product.multiBuyOffer.text,
      percent: 0,
      amount: 0,
    });
  }

  // No real savings layers (deal badge alone doesn't count)
  const realLayers = layers.filter((l) => l.amount > 0);
  if (realLayers.length === 0) return null;

  const effectivePrice = Math.max(0, runningPrice);
  const totalAmount = basePrice - effectivePrice;
  const totalPercent = basePrice > 0 ? (totalAmount / basePrice) * 100 : 0;

  const color: SavingsStack["color"] =
    totalPercent >= 30 ? "green" : totalPercent >= 15 ? "amber" : "gray";

  return {
    layers,
    totalPercent,
    totalAmount,
    effectivePrice: Math.round(effectivePrice * 100) / 100,
    basePrice,
    color,
  };
}

// ── Badge UI ─────────────────────────────────────────────────────────

const BADGE_CLASS = "bas-savings-badge";

/** CSS styles for the savings badge. */
export const SAVINGS_BADGE_STYLES = `
  .${BADGE_CLASS} {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    margin-top: 4px;
    position: relative;
    cursor: default;
  }
  .${BADGE_CLASS}--green { background: #e6f4ea; color: #067d62; border: 1px solid #b7e1cd; }
  .${BADGE_CLASS}--amber { background: #fef7e0; color: #b07c0a; border: 1px solid #fdd663; }
  .${BADGE_CLASS}--gray  { background: #f0f0f0; color: #565959; border: 1px solid #d5d9d9; }

  .${BADGE_CLASS}__tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    background: #232f3e;
    color: #fff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 400;
    line-height: 1.5;
    white-space: nowrap;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    pointer-events: none;
  }
  .${BADGE_CLASS}__tooltip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 16px;
    border: 5px solid transparent;
    border-top-color: #232f3e;
  }
  .${BADGE_CLASS}:hover .${BADGE_CLASS}__tooltip { display: block; }
`;

/**
 * Inject the savings stack badge onto a product card.
 * Removes any existing badge first to handle re-renders.
 */
export function injectSavingsBadge(card: HTMLElement, stack: SavingsStack): void {
  removeSavingsBadge(card);

  const badge = document.createElement("div");
  badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--${stack.color}`;

  // Main text: "Save 42% ($18.50) → $25.49"
  const mainText = document.createElement("span");
  mainText.textContent =
    `💰 Save ${Math.round(stack.totalPercent)}% ($${stack.totalAmount.toFixed(2)}) → $${stack.effectivePrice.toFixed(2)}`;
  badge.appendChild(mainText);

  // Tooltip with layer breakdown
  const tooltip = document.createElement("div");
  tooltip.className = `${BADGE_CLASS}__tooltip`;
  const lines: string[] = [`Savings breakdown (from $${stack.basePrice.toFixed(2)}):`];
  for (const layer of stack.layers) {
    if (layer.amount > 0) {
      lines.push(`  · ${layer.label} — saves $${layer.amount.toFixed(2)}`);
    } else if (layer.type === "deal-badge") {
      lines.push(`  · ⏰ ${layer.label}`);
    } else if (layer.type === "multi-buy") {
      lines.push(`  · 🏷️ ${layer.label}`);
    }
  }
  lines.push(`Effective price: $${stack.effectivePrice.toFixed(2)}`);
  tooltip.textContent = lines.join("\n");
  tooltip.style.whiteSpace = "pre";
  badge.appendChild(tooltip);

  // Insert after the price row
  const priceRow =
    card.querySelector(".a-price") ??
    card.querySelector('[data-cy="price-recipe"]') ??
    card.querySelector("span.a-offscreen")?.parentElement;
  if (priceRow?.parentElement) {
    priceRow.parentElement.insertBefore(badge, priceRow.nextSibling);
  } else {
    card.appendChild(badge);
  }
}

/** Remove the savings badge from a card. */
export function removeSavingsBadge(card: HTMLElement): void {
  card.querySelector(`.${BADGE_CLASS}`)?.remove();
}

const MULTI_BUY_CLASS = "bas-multi-buy-badge";

/** CSS styles for the standalone multi-buy badge. */
export const MULTI_BUY_BADGE_STYLES = `
  .${MULTI_BUY_CLASS} {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.4;
    margin-top: 4px;
    background: #eef6ff;
    color: #0066c0;
    border: 1px solid #c8dfff;
  }
`;

/**
 * Inject a standalone multi-buy badge when no savings stack exists.
 * If a savings stack is present, multi-buy is shown in its tooltip instead.
 */
export function injectMultiBuyBadge(card: HTMLElement, text: string): void {
  removeMultiBuyBadge(card);

  const badge = document.createElement("div");
  badge.className = MULTI_BUY_CLASS;
  badge.textContent = `🏷️ ${text}`;
  badge.title = "Multi-buy promotional offer available on this product";

  const priceRow =
    card.querySelector(".a-price") ??
    card.querySelector('[data-cy="price-recipe"]') ??
    card.querySelector("span.a-offscreen")?.parentElement;
  if (priceRow?.parentElement) {
    priceRow.parentElement.insertBefore(badge, priceRow.nextSibling);
  } else {
    card.appendChild(badge);
  }
}

/** Remove the standalone multi-buy badge from a card. */
export function removeMultiBuyBadge(card: HTMLElement): void {
  card.querySelector(`.${MULTI_BUY_CLASS}`)?.remove();
}
