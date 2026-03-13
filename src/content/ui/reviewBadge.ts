import type { ReviewScore } from "../../review/types";

const BADGE_CLASS = "bas-review-badge";

/**
 * Inject or update a review quality badge on a product card.
 */
export function injectReviewBadge(
  card: HTMLElement,
  score: ReviewScore | null,
): void {
  let badge = card.querySelector<HTMLElement>(`.${BADGE_CLASS}`);

  if (!score) {
    // Show loading state
    if (!badge) {
      badge = createBadge();
      const insertTarget =
        card.querySelector("h2") || card.querySelector(".a-section") || card;
      insertTarget.after(badge);
    }
    badge.textContent = "⏳ Analyzing reviews…";
    badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--loading`;
    badge.title = "Fetching review data for analysis";
    return;
  }

  if (!badge) {
    badge = createBadge();
    const insertTarget =
      card.querySelector("h2") || card.querySelector(".a-section") || card;
    insertTarget.after(badge);
  }

  const { label, score: numScore, breakdown } = score;

  if (label === "authentic") {
    badge.textContent = `✓ Reviews look authentic (${numScore}/100)`;
    badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--authentic`;
  } else if (label === "mixed") {
    badge.textContent = `⚠ Mixed review signals (${numScore}/100)`;
    badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--mixed`;
  } else {
    badge.textContent = `🚩 Suspicious reviews (${numScore}/100)`;
    badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--suspicious`;
  }

  badge.title = breakdown.reasons.length > 0
    ? breakdown.reasons.join("\n")
    : "No issues detected";
}

/**
 * Remove the review badge from a card.
 */
export function removeReviewBadge(card: HTMLElement): void {
  card.querySelector(`.${BADGE_CLASS}`)?.remove();
}

function createBadge(): HTMLElement {
  const badge = document.createElement("div");
  badge.className = BADGE_CLASS;
  return badge;
}

/**
 * Get the CSS styles for review badges (injected into the page's global styles).
 */
export const REVIEW_BADGE_STYLES = `
  .${BADGE_CLASS} {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    margin: 4px 0;
    display: inline-block;
    font-weight: 600;
    line-height: 1.4;
    cursor: help;
  }
  .${BADGE_CLASS}--loading {
    color: #565959;
    background: #f0f2f2;
    border: 1px solid #d5d9d9;
  }
  .${BADGE_CLASS}--authentic {
    color: #067d62;
    background: #e6f7f1;
    border: 1px solid #067d62;
  }
  .${BADGE_CLASS}--mixed {
    color: #b06000;
    background: #fff8e6;
    border: 1px solid #e0a800;
  }
  .${BADGE_CLASS}--suspicious {
    color: #cc0c39;
    background: #fce8ec;
    border: 1px solid #cc0c39;
  }
`;
