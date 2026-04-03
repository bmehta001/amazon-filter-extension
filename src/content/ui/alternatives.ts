/**
 * Better Alternatives — highlights higher-scoring products on the same
 * search page when a product has low trust/deal scores.
 *
 * Shows a "Better option on this page" hint on low-scoring cards and
 * a "⭐ Top Pick" badge on the best product by trust-to-price ratio.
 */

import type { Product } from "../../types";
import type { LicenseTier } from "../../licensing/license";
import { COLORS, RADII, FONT, SPACE } from "./designTokens";

const TOP_PICK_CLASS = "bas-top-pick";
const ALT_HINT_CLASS = "bas-alt-hint";

export const ALTERNATIVES_STYLES = `
.${TOP_PICK_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: ${RADII.sm};
  background: linear-gradient(135deg, #e6f7e6 0%, #d4edda 100%);
  border: 1px solid #c3e6c3;
  font-size: ${FONT.sm};
  font-family: ${FONT.family};
  color: ${COLORS.success};
  font-weight: 600;
  margin: 3px 0;
}
.${ALT_HINT_CLASS} {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-family: ${FONT.family};
  color: ${COLORS.textMuted};
  margin: 2px 0;
  padding: 2px 0;
}
.${ALT_HINT_CLASS}-link {
  color: ${COLORS.info};
  cursor: pointer;
  text-decoration: none;
}
.${ALT_HINT_CLASS}-link:hover {
  text-decoration: underline;
}
`;

interface ScoredProduct {
  product: Product;
  trustScore: number;
  priceRatio: number; // trust-to-price ratio (higher = better value)
}

/**
 * Analyze visible products and inject Top Pick / alternative hints.
 * Call after review analysis and deal scoring are complete.
 */
export function injectAlternatives(
  products: Product[],
  reviewScoreMap: Map<string, { score: number }>,
  trustScoreMap: Map<string, { score: number }>,
  tier: LicenseTier,
): void {
  // Remove existing badges first
  for (const p of products) {
    p.element.querySelector(`.${TOP_PICK_CLASS}`)?.remove();
    p.element.querySelector(`.${ALT_HINT_CLASS}`)?.remove();
  }

  // Score products that have both trust data and a price
  const scored: ScoredProduct[] = [];
  for (const p of products) {
    if (!p.asin || p.price == null || p.price <= 0) continue;
    const trust = trustScoreMap.get(p.asin);
    const review = reviewScoreMap.get(p.asin);
    if (!trust && !review) continue;

    const trustScore = trust?.score ?? review?.score ?? 50;
    const priceRatio = trustScore / p.price; // higher = more trust per dollar
    scored.push({ product: p, trustScore, priceRatio });
  }

  if (scored.length < 3) return; // Need enough products for meaningful comparison

  // Find the top pick (highest trust-to-price ratio among products with trust ≥ 70)
  const qualified = scored.filter((s) => s.trustScore >= 70);
  if (qualified.length === 0) return;

  qualified.sort((a, b) => b.priceRatio - a.priceRatio);
  const topPick = qualified[0];

  // Inject "⭐ Top Pick" badge on the best product
  injectTopPickBadge(topPick.product.element);

  // For products with low trust scores, show alternative hint
  const lowScored = scored.filter(
    (s) => s.trustScore < 60 && s.product.asin !== topPick.product.asin,
  );

  for (const low of lowScored) {
    injectAlternativeHint(low.product.element, topPick.product, tier);
  }
}

function injectTopPickBadge(card: HTMLElement): void {
  if (card.querySelector(`.${TOP_PICK_CLASS}`)) return;

  const badge = document.createElement("div");
  badge.className = TOP_PICK_CLASS;
  badge.textContent = "⭐ Top Pick — Best trust-to-price ratio on this page";
  badge.title = "This product has the highest combination of review trustworthiness and value on this search page";

  const anchor =
    card.querySelector(".bas-product-score-meta") ??
    card.querySelector(".bas-product-score") ??
    card.querySelector("h2");

  if (anchor && anchor !== card) {
    anchor.after(badge);
  } else {
    card.prepend(badge);
  }
}

function injectAlternativeHint(
  card: HTMLElement,
  topPick: Product,
  tier: LicenseTier,
): void {
  if (card.querySelector(`.${ALT_HINT_CLASS}`)) return;

  const hint = document.createElement("div");
  hint.className = ALT_HINT_CLASS;

  if (tier === "pro") {
    // Pro: show the specific alternative
    const icon = document.createElement("span");
    icon.textContent = "💡";

    const text = document.createElement("span");
    text.textContent = "Better option found: ";

    const link = document.createElement("span");
    link.className = `${ALT_HINT_CLASS}-link`;
    link.textContent = truncate(topPick.title, 40);
    link.title = topPick.title;
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      topPick.element.scrollIntoView({ behavior: "smooth", block: "center" });
      topPick.element.style.outline = `2px solid ${COLORS.success}`;
      setTimeout(() => { topPick.element.style.outline = ""; }, 3000);
    });

    hint.appendChild(icon);
    hint.appendChild(text);
    hint.appendChild(link);
  } else {
    // Free: just hint that a better option exists
    const icon = document.createElement("span");
    icon.textContent = "💡";
    const text = document.createElement("span");
    text.textContent = "A higher-rated option is available on this page";
    hint.appendChild(icon);
    hint.appendChild(text);
  }

  const anchor =
    card.querySelector(".bas-product-score-meta") ??
    card.querySelector(".bas-product-score") ??
    card.querySelector("h2");

  if (anchor && anchor !== card) {
    anchor.after(hint);
  } else {
    card.appendChild(hint);
  }
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}
