/**
 * Upgrade prompt — subtle, non-intrusive inline indicators that
 * a feature requires Pro. Shows a lock icon with tooltip.
 * No nag screens, no blocking modals — just visible limitation.
 */

import type { FeatureId } from "../../licensing/featureGate";
import { getFeatureLabel } from "../../licensing/featureGate";
import { recordProLockClick } from "../../insights/usageTracker";
import { COLORS, RADII, FONT } from "./designTokens";

const LOCK_CLASS = "bas-pro-lock";

export const UPGRADE_PROMPT_STYLES = `
.${LOCK_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: ${RADII.sm};
  background: linear-gradient(135deg, #f8f4ff 0%, #f0e8ff 100%);
  border: 1px solid #e0d4f5;
  font-size: ${FONT.sm};
  font-family: ${FONT.family};
  color: #6b21a8;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s;
}
.${LOCK_CLASS}:hover {
  background: linear-gradient(135deg, #f0e8ff 0%, #e8dcff 100%);
  border-color: #c4b0e0;
}
.${LOCK_CLASS}-icon {
  font-size: 10px;
}
.${LOCK_CLASS}-text {
  font-weight: 600;
  font-size: 10px;
}
`;

/**
 * Create a small inline "🔒 Pro" badge that hints at a locked feature.
 * Clicking it opens the extension popup (or a payment URL).
 */
export function createProLockBadge(
  feature: FeatureId,
  paymentUrl?: string,
): HTMLElement {
  const badge = document.createElement("span");
  badge.className = LOCK_CLASS;
  badge.title = `${getFeatureLabel(feature)} — Upgrade to Pro to unlock`;
  badge.setAttribute("role", "button");
  badge.setAttribute("tabindex", "0");
  badge.setAttribute("aria-label", `Upgrade to Pro for ${getFeatureLabel(feature)}`);

  const icon = document.createElement("span");
  icon.className = `${LOCK_CLASS}-icon`;
  icon.textContent = "🔒";

  const text = document.createElement("span");
  text.className = `${LOCK_CLASS}-text`;
  text.textContent = "Pro";

  badge.appendChild(icon);
  badge.appendChild(text);

  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    void recordProLockClick(feature);
    if (paymentUrl) {
      window.open(paymentUrl, "_blank", "noopener");
    } else {
      // Fall back to opening the extension popup (chrome.runtime API)
      try {
        chrome.runtime.sendMessage({ type: "openUpgrade" });
      } catch {
        // If runtime not available, do nothing
      }
    }
  });

  badge.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); badge.click(); }
  });

  return badge;
}

/**
 * Inject a lock badge after a specific element on a card.
 * Used to replace where a premium badge/panel would normally appear.
 */
export function injectProLockInPlace(
  card: HTMLElement,
  feature: FeatureId,
  anchorSelector?: string,
): void {
  // Don't inject twice for the same feature
  if (card.querySelector(`.${LOCK_CLASS}[data-feature="${feature}"]`)) return;

  const badge = createProLockBadge(feature);
  badge.setAttribute("data-feature", feature);

  const anchor = anchorSelector
    ? card.querySelector(anchorSelector)
    : card.querySelector(".bas-product-score, h2");

  if (anchor && anchor !== card) {
    anchor.after(badge);
  } else {
    card.appendChild(badge);
  }
}

/** Remove all pro lock badges from a card. */
export function removeProLocks(card: HTMLElement): void {
  card.querySelectorAll(`.${LOCK_CLASS}`).forEach((el) => el.remove());
}
