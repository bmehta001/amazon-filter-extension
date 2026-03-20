/**
 * Duplicate listing badge — visual indicator showing when a product
 * appears to be the same item as another listing.
 */

import type { DuplicateGroup } from "../crossListingDedup";
import { duplicateLabel } from "../crossListingDedup";
import type { Product } from "../../types";

export const DUPLICATE_BADGE_STYLES = `
.bas-dup-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  cursor: help;
  white-space: nowrap;
  margin: 2px 4px;
}
.bas-dup-badge--best {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #c8e6c9;
}
.bas-dup-badge--dupe {
  background: #fff3e0;
  color: #e65100;
  border: 1px solid #ffe0b2;
}
`;

/**
 * Inject a duplicate listing badge onto a product card.
 */
export function injectDuplicateBadge(
  card: HTMLElement,
  group: DuplicateGroup,
  productIndex: number,
  products: Product[],
): void {
  // Remove existing badge
  card.querySelector(".bas-dup-badge")?.remove();

  const isBest = productIndex === group.bestIndex;
  const label = duplicateLabel(group, productIndex, products);

  const badge = document.createElement("span");
  badge.className = `bas-dup-badge ${isBest ? "bas-dup-badge--best" : "bas-dup-badge--dupe"}`;
  badge.title = label;
  badge.textContent = isBest
    ? `🏆 Best of ${group.memberIndices.length} listings`
    : `🔄 Similar listing found`;

  const anchor = card.querySelector("h2, .a-size-medium, .a-size-base-plus");
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(badge, anchor.nextSibling);
  } else {
    card.appendChild(badge);
  }
}

/**
 * Remove duplicate badge from a card.
 */
export function removeDuplicateBadge(card: HTMLElement): void {
  card.querySelector(".bas-dup-badge")?.remove();
}
