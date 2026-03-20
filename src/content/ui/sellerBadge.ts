/**
 * Seller Trust Badge — shows a small seller trust indicator on product cards
 * with tooltip details about fulfillment, brand match, and risk signals.
 */

import type { SellerTrustResult, SellerTrustSignal } from "../../seller/trust";

const BADGE_CLASS = "bas-seller-badge";

export const SELLER_BADGE_STYLES = `
.${BADGE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 2px;
  cursor: help;
  white-space: nowrap;
}
.${BADGE_CLASS}--green {
  color: #067d62;
  background: #e6f7f1;
  border: 1px solid #b7e4d0;
}
.${BADGE_CLASS}--gray {
  color: #565959;
  background: #f5f5f5;
  border: 1px solid #d5d9d9;
}
.${BADGE_CLASS}--orange {
  color: #c65102;
  background: #fff3e0;
  border: 1px solid #ffcc80;
}
.${BADGE_CLASS}--red {
  color: #cc0c39;
  background: #fce8ec;
  border: 1px solid #f5c6cb;
}
`;

const LABEL_TEXT: Record<SellerTrustResult["label"], string> = {
  trusted: "Trusted Seller",
  neutral: "Seller",
  caution: "Seller ⚠",
  risky: "Risky Seller",
};

const LABEL_EMOJI: Record<SellerTrustResult["label"], string> = {
  trusted: "✓",
  neutral: "•",
  caution: "⚠",
  risky: "⛔",
};

/**
 * Inject a seller trust badge on a product card.
 */
export function injectSellerBadge(
  card: HTMLElement,
  result: SellerTrustResult,
): void {
  // Don't inject twice
  if (card.querySelector(`.${BADGE_CLASS}`)) return;

  const badge = document.createElement("span");
  badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--${result.color}`;
  badge.textContent = `${LABEL_EMOJI[result.label]} ${LABEL_TEXT[result.label]}`;

  // Build tooltip
  const lines: string[] = [result.summary, ""];
  for (const signal of result.signals) {
    if (signal.points !== 0 || signal.severity !== "none") {
      const prefix = signal.points > 0 ? "✅" : signal.severity === "high" ? "🚨" : "⚠️";
      lines.push(`${prefix} ${signal.reason}`);
    }
  }
  badge.title = lines.join("\n");

  // Insert after the seller info display area, or near the price
  const anchor =
    card.querySelector(".a-row.a-size-base .a-link-normal[href*='seller']") ??
    card.querySelector("span.a-price") ??
    card.querySelector("[data-a-color='price']");

  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(badge, anchor.nextSibling);
  } else {
    // Fallback: append to bottom of card
    card.appendChild(badge);
  }
}

/** Remove seller badge from a card. */
export function removeSellerBadge(card: HTMLElement): void {
  card.querySelector(`.${BADGE_CLASS}`)?.remove();
}
