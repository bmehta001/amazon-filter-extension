/**
 * Product Confidence Badge — a compact composite indicator showing
 * review trust, seller trust, and deal quality side-by-side.
 *
 * Displays as a small row of colored dots/icons with a unified tooltip
 * summarizing all three dimensions. Does NOT blend scores — keeps them
 * independent for transparency.
 */

import type { TrustScoreResult } from "../../review/trustScore";
import type { SellerTrustResult } from "../../seller/trust";
import type { ListingIntegrityResult } from "../../seller/listingSignals";
import type { DealScore } from "../dealScoring";
import type { BsrInfo } from "../../types";

const BADGE_CLASS = "bas-confidence";

export interface ConfidenceInput {
  reviewTrust?: TrustScoreResult;
  sellerTrust?: SellerTrustResult;
  listingIntegrity?: ListingIntegrityResult;
  dealScore?: DealScore;
  bsr?: BsrInfo;
}

export const CONFIDENCE_BADGE_STYLES = `
.${BADGE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 4px;
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  margin: 4px 0;
  font-size: 10px;
  line-height: 1.3;
  cursor: help;
}
.${BADGE_CLASS}-dot {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 600;
}
.${BADGE_CLASS}-dot-icon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.${BADGE_CLASS}-dot-icon--green { background: #067d62; }
.${BADGE_CLASS}-dot-icon--yellow { background: #e0a800; }
.${BADGE_CLASS}-dot-icon--orange { background: #e65100; }
.${BADGE_CLASS}-dot-icon--red { background: #cc0c39; }
.${BADGE_CLASS}-dot-icon--gray { background: #999; }
.${BADGE_CLASS}-sep {
  width: 1px;
  height: 12px;
  background: #ddd;
}
`;

type DotColor = "green" | "yellow" | "orange" | "red" | "gray";

interface DotSpec {
  label: string;
  color: DotColor;
  tooltipLine: string;
}

/**
 * Inject a compact product confidence badge showing all trust dimensions.
 */
export function injectConfidenceBadge(
  card: HTMLElement,
  input: ConfidenceInput,
): void {
  // Don't inject twice
  if (card.querySelector(`.${BADGE_CLASS}`)) return;

  const dots = buildDots(input);
  if (dots.length === 0) return;

  const badge = document.createElement("div");
  badge.className = BADGE_CLASS;

  for (let i = 0; i < dots.length; i++) {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = `${BADGE_CLASS}-sep`;
      badge.appendChild(sep);
    }
    badge.appendChild(createDot(dots[i]));
  }

  // Build unified tooltip
  const tooltipLines = ["Product Confidence:", ""];
  for (const dot of dots) {
    tooltipLines.push(dot.tooltipLine);
  }
  if (input.bsr) {
    tooltipLines.push(`📊 BSR: #${input.bsr.rank.toLocaleString()} in ${input.bsr.category}`);
  }
  badge.title = tooltipLines.join("\n");

  // Add BSR compact label if available
  if (input.bsr && dots.length > 0) {
    const sep = document.createElement("span");
    sep.className = `${BADGE_CLASS}-sep`;
    badge.appendChild(sep);
    const bsrLabel = document.createElement("span");
    bsrLabel.className = `${BADGE_CLASS}-dot`;
    bsrLabel.textContent = `#${input.bsr.rank.toLocaleString()}`;
    badge.appendChild(bsrLabel);
  }

  // Insert near the top of the card
  const anchor = card.querySelector("h2, .a-size-medium, .a-size-base-plus");
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(badge, anchor.nextSibling);
  } else {
    card.prepend(badge);
  }
}

/** Remove the confidence badge from a card. */
export function removeConfidenceBadge(card: HTMLElement): void {
  card.querySelector(`.${BADGE_CLASS}`)?.remove();
}

function buildDots(input: ConfidenceInput): DotSpec[] {
  const dots: DotSpec[] = [];

  if (input.reviewTrust) {
    const rt = input.reviewTrust;
    dots.push({
      label: `Reviews ${rt.score}`,
      color: rt.color as DotColor,
      tooltipLine: `🛡️ Review Trust: ${rt.score}/100 — ${capitalize(rt.label)}`,
    });
  }

  if (input.sellerTrust) {
    const st = input.sellerTrust;
    dots.push({
      label: `Seller ${st.score}`,
      color: st.color as DotColor,
      tooltipLine: `🏪 Seller Trust: ${st.score}/100 — ${capitalize(st.label)}`,
    });
  }

  if (input.listingIntegrity) {
    const li = input.listingIntegrity;
    dots.push({
      label: `Listing ${li.score}`,
      color: li.color as DotColor,
      tooltipLine: `📋 Listing Integrity: ${li.score}/100 — ${capitalize(li.label)}`,
    });
  }

  if (input.dealScore) {
    const ds = input.dealScore;
    const color = ds.label === "Great Deal" ? "green"
      : ds.label === "Good Deal" ? "yellow"
      : ds.label === "Normal Price" ? "gray"
      : "red";
    dots.push({
      label: `Deal ${ds.score}`,
      color,
      tooltipLine: `💰 Deal Quality: ${ds.score}/100 — ${ds.label}`,
    });
  }

  return dots;
}

function createDot(spec: DotSpec): HTMLElement {
  const container = document.createElement("span");
  container.className = `${BADGE_CLASS}-dot`;

  const dot = document.createElement("span");
  dot.className = `${BADGE_CLASS}-dot-icon ${BADGE_CLASS}-dot-icon--${spec.color}`;
  container.appendChild(dot);

  const text = document.createElement("span");
  text.textContent = spec.label;
  container.appendChild(text);

  return container;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
