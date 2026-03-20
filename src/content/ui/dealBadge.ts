/**
 * Deal quality badge — injects a color-coded deal indicator next to
 * the price on each product card with deal signals.
 */

import type { DealScore } from "../dealScoring";

export const DEAL_BADGE_STYLES = `
  .bas-deal-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    vertical-align: middle;
    margin-left: 6px;
    cursor: help;
    white-space: nowrap;
  }
  .bas-deal-badge--great {
    background: #e7f7e7;
    color: #067d62;
    border: 1px solid #067d62;
  }
  .bas-deal-badge--good {
    background: #fff8e1;
    color: #b07c0a;
    border: 1px solid #d4a017;
  }
  .bas-deal-badge--normal {
    background: #f5f5f5;
    color: #565959;
    border: 1px solid #d5d9d9;
  }
  .bas-deal-badge--suspicious {
    background: #fde8e8;
    color: #cc0c39;
    border: 1px solid #cc0c39;
  }
  .bas-deal-badge--inflated {
    background: #fff3e0;
    color: #e65100;
    border: 1px solid #e65100;
  }
`;

/**
 * Inject a deal quality badge on a product card next to the price.
 */
export function injectDealBadge(card: HTMLElement, dealScore: DealScore): void {
  // Don't inject twice
  if (card.querySelector(".bas-deal-badge")) return;

  const priceEl =
    card.querySelector("span.a-price") ||
    card.querySelector("[data-a-color='price']");
  if (!priceEl) return;

  const badge = document.createElement("span");
  badge.className = `bas-deal-badge ${labelToClass(dealScore.label)}`;

  // Build badge text
  const parts: string[] = [dealScore.emoji];
  if (dealScore.effectiveDiscount > 0) {
    parts.push(`${dealScore.effectiveDiscount}% off`);
  }
  parts.push(dealScore.label);
  badge.textContent = parts.join(" ");

  // Tooltip with signal details
  const tooltipLines = dealScore.signals.map(
    (s) => `${s.points > 0 ? "+" : ""}${s.points} ${s.description}`,
  );
  tooltipLines.unshift(`Deal Score: ${dealScore.score}/100`);

  // Append manipulation warnings if any
  if (dealScore.manipulationWarnings.length > 0) {
    tooltipLines.push("");
    tooltipLines.push("⚠️ Price concerns:");
    for (const warning of dealScore.manipulationWarnings) {
      tooltipLines.push(`• ${warning}`);
    }
  }

  badge.title = tooltipLines.join("\n");

  priceEl.parentElement?.insertBefore(badge, priceEl.nextSibling);
}

function labelToClass(label: DealScore["label"]): string {
  switch (label) {
    case "Great Deal":
      return "bas-deal-badge--great";
    case "Good Deal":
      return "bas-deal-badge--good";
    case "Normal Price":
      return "bas-deal-badge--normal";
    case "Suspicious Discount":
      return "bas-deal-badge--suspicious";
    case "Inflated Pricing":
      return "bas-deal-badge--inflated";
  }
}
