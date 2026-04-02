/**
 * Price Intelligence Line — a single compact line next to the price
 * that merges deal score, savings stack, multi-buy offers, and sparkline
 * into one cohesive price signal.
 */

import type { DealScore } from "../dealScoring";
import type { MultiBuyOffer } from "../../types";
import { COLORS, RADII, FONT, SPACE } from "./designTokens";

const LINE_CLASS = "bas-price-intel";

export interface PriceIntelInput {
  dealScore?: DealScore;
  /** Total savings percentage from all sources. */
  savingsPercent?: number;
  /** Savings breakdown tooltip text. */
  savingsTooltip?: string;
  /** Effective price after all discounts. */
  effectivePrice?: number;
  /** Multi-buy offer text. */
  multiBuy?: MultiBuyOffer;
  /** Whether a Keepa sparkline is available (we just show the link). */
  hasSparkline?: boolean;
  /** CamelCamelCamel URL for price history. */
  priceHistoryUrl?: string;
}

export const PRICE_INTEL_STYLES = `
.${LINE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: ${FONT.sm};
  font-family: ${FONT.family};
  color: ${COLORS.textSecondary};
  margin: 2px 0;
  line-height: 1.4;
}
.${LINE_CLASS}-deal {
  font-weight: 600;
  padding: 1px 5px;
  border-radius: ${RADII.sm};
  font-size: ${FONT.sm};
}
.${LINE_CLASS}-deal--great {
  color: ${COLORS.success};
  background: #e6f7e6;
}
.${LINE_CLASS}-deal--good {
  color: ${COLORS.warning};
  background: #fff3e0;
}
.${LINE_CLASS}-deal--normal {
  color: ${COLORS.neutral};
  background: ${COLORS.surface1};
}
.${LINE_CLASS}-deal--inflated {
  color: ${COLORS.danger};
  background: #fde8e8;
}
.${LINE_CLASS}-savings {
  color: ${COLORS.success};
  font-weight: 600;
  cursor: help;
}
.${LINE_CLASS}-multibuy {
  color: ${COLORS.info};
  font-size: 10px;
}
.${LINE_CLASS}-sep {
  color: ${COLORS.borderLight};
}
.${LINE_CLASS}-history {
  color: ${COLORS.textLink};
  text-decoration: none;
  font-size: 10px;
  cursor: pointer;
}
.${LINE_CLASS}-history:hover {
  text-decoration: underline;
}
`;

/**
 * Inject a unified price intelligence line onto a product card.
 */
export function injectPriceIntel(card: HTMLElement, input: PriceIntelInput): void {
  removePriceIntel(card);

  // Don't inject if there's nothing to show
  if (!input.dealScore && !input.savingsPercent && !input.multiBuy) return;

  const line = document.createElement("div");
  line.className = LINE_CLASS;

  // Savings percentage
  if (input.savingsPercent && input.savingsPercent > 0) {
    const savings = document.createElement("span");
    savings.className = `${LINE_CLASS}-savings`;
    savings.textContent = `Save ${Math.round(input.savingsPercent)}%`;
    if (input.savingsTooltip) savings.title = input.savingsTooltip;
    if (input.effectivePrice) {
      savings.title = (savings.title ? savings.title + "\n" : "") +
        `Effective price: $${input.effectivePrice.toFixed(2)}`;
    }
    line.appendChild(savings);
  }

  // Deal score label
  if (input.dealScore) {
    if (line.children.length > 0) addSep(line);
    const deal = document.createElement("span");
    const dealClass = input.dealScore.label === "Great Deal" ? "great"
      : input.dealScore.label === "Good Deal" ? "good"
      : input.dealScore.label === "Normal Price" ? "normal"
      : "inflated";
    deal.className = `${LINE_CLASS}-deal ${LINE_CLASS}-deal--${dealClass}`;
    deal.textContent = input.dealScore.label;
    deal.title = `Deal Score: ${input.dealScore.score}/100`;
    line.appendChild(deal);
  }

  // Multi-buy
  if (input.multiBuy) {
    if (line.children.length > 0) addSep(line);
    const mb = document.createElement("span");
    mb.className = `${LINE_CLASS}-multibuy`;
    mb.textContent = `🏷️ ${input.multiBuy.text}`;
    line.appendChild(mb);
  }

  // Price history link
  if (input.priceHistoryUrl) {
    if (line.children.length > 0) addSep(line);
    const link = document.createElement("a");
    link.className = `${LINE_CLASS}-history`;
    link.href = input.priceHistoryUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "📈";
    link.title = "View price history";
    link.addEventListener("click", (e) => e.stopPropagation());
    line.appendChild(link);
  }

  // Insert near the price area
  const priceEl =
    card.querySelector(".a-price, .a-color-price, .a-offscreen") ??
    card.querySelector('[data-a-color="price"]');
  const priceParent = priceEl?.closest(".a-section, .a-row, .a-spacing-top-micro") ?? priceEl?.parentElement;

  if (priceParent && priceParent !== card) {
    priceParent.after(line);
  } else {
    // Fallback: after the product score badge or at bottom
    const fallback = card.querySelector(".bas-product-score") ?? card.querySelector("h2");
    if (fallback) {
      const nextPanel = fallback.nextElementSibling;
      if (nextPanel?.classList.contains("bas-product-score-panel")) {
        nextPanel.after(line);
      } else {
        fallback.after(line);
      }
    } else {
      card.appendChild(line);
    }
  }
}

/** Remove price intelligence line from a card. */
export function removePriceIntel(card: HTMLElement): void {
  card.querySelector(`.${LINE_CLASS}`)?.remove();
}

function addSep(parent: HTMLElement): void {
  const sep = document.createElement("span");
  sep.className = `${LINE_CLASS}-sep`;
  sep.textContent = "·";
  parent.appendChild(sep);
}
