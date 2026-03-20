/**
 * Trust Score Badge — shows a shield-style badge on product cards
 * indicating review authenticity with expandable signal details.
 */

import type { TrustScoreResult } from "../../review/trustScore";
import type { TrustSignal } from "../../review/trustSignals";

const BADGE_CLASS = "bas-trust-badge";
const DETAIL_CLASS = "bas-trust-detail";

export const TRUST_BADGE_STYLES = `
.${BADGE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  margin: 4px 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
}
.${BADGE_CLASS}--loading {
  color: #565959;
  background: #f0f2f2;
  border: 1px solid #d5d9d9;
}
.${BADGE_CLASS}--green {
  color: #067d62;
  background: #e6f7f1;
  border: 1px solid #067d62;
}
.${BADGE_CLASS}--yellow {
  color: #b06000;
  background: #fff8e6;
  border: 1px solid #e0a800;
}
.${BADGE_CLASS}--orange {
  color: #c65102;
  background: #fff3e0;
  border: 1px solid #e65100;
}
.${BADGE_CLASS}--red {
  color: #cc0c39;
  background: #fce8ec;
  border: 1px solid #cc0c39;
}
.${BADGE_CLASS}:hover {
  filter: brightness(0.95);
}

.${DETAIL_CLASS} {
  display: none;
  background: #fafafa;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 10px;
  margin: 4px 0;
  font-size: 11px;
  line-height: 1.5;
  color: #333;
  max-width: 100%;
}
.${DETAIL_CLASS}.${DETAIL_CLASS}--expanded {
  display: block;
}
.${DETAIL_CLASS}-header {
  font-weight: bold;
  font-size: 12px;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.${DETAIL_CLASS}-score {
  font-size: 18px;
  font-weight: 700;
}
.${DETAIL_CLASS}-section {
  margin-top: 8px;
}
.${DETAIL_CLASS}-section-title {
  font-weight: 600;
  font-size: 11px;
  color: #555;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.${DETAIL_CLASS}-signal {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid #f0f0f0;
}
.${DETAIL_CLASS}-signal:last-child {
  border-bottom: none;
}
.${DETAIL_CLASS}-signal-icon {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}
.${DETAIL_CLASS}-signal-text {
  flex: 1;
  font-size: 10px;
  color: #444;
}
.${DETAIL_CLASS}-signal-deduction {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  min-width: 35px;
  text-align: right;
}
.${DETAIL_CLASS}-positive {
  color: #067d62;
  font-size: 10px;
  padding: 2px 0;
}
.${DETAIL_CLASS}-meta {
  font-size: 9px;
  color: #999;
  margin-top: 6px;
}
`;

const LABEL_TEXT: Record<TrustScoreResult["label"], string> = {
  trustworthy: "Trustworthy Reviews",
  mixed: "Mixed Signals",
  questionable: "Questionable Reviews",
  suspicious: "Suspicious Reviews",
};

const LABEL_EMOJI: Record<TrustScoreResult["label"], string> = {
  trustworthy: "🛡️",
  mixed: "⚠️",
  questionable: "🔍",
  suspicious: "🚩",
};

const SEVERITY_ICON: Record<TrustSignal["severity"], string> = {
  none: "✅",
  low: "ℹ️",
  medium: "⚠️",
  high: "🚨",
};

/**
 * Inject or update a trust score badge on a product card.
 * Pass null for score to show loading state.
 */
export function injectTrustBadge(
  card: HTMLElement,
  score: TrustScoreResult | null,
): void {
  // Remove existing badge + detail to replace
  removeTrustBadge(card);

  const badge = document.createElement("div");
  badge.className = BADGE_CLASS;

  if (!score) {
    badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--loading`;
    badge.textContent = "🛡️ Analyzing review trust…";
    badge.title = "Computing trust score from review signals";
    insertBadge(card, badge);
    return;
  }

  badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--${score.color}`;
  badge.textContent = `${LABEL_EMOJI[score.label]} ${score.score}/100 — ${LABEL_TEXT[score.label]}`;
  badge.title = "Click for detailed trust analysis";

  // Build detail panel
  const detail = buildDetailPanel(score);

  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    detail.classList.toggle(`${DETAIL_CLASS}--expanded`);
  });

  insertBadge(card, badge, detail);
}

/** Remove trust badge and detail panel from a card. */
export function removeTrustBadge(card: HTMLElement): void {
  card.querySelectorAll(`.${BADGE_CLASS}, .${DETAIL_CLASS}`).forEach((el) => el.remove());
}

function insertBadge(card: HTMLElement, badge: HTMLElement, detail?: HTMLElement): void {
  const anchor = card.querySelector("h2, .a-size-medium, .a-size-base-plus");
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(badge, anchor.nextSibling);
    if (detail) {
      anchor.parentElement.insertBefore(detail, badge.nextSibling);
    }
  } else {
    if (detail) card.prepend(detail);
    card.prepend(badge);
  }
}

function buildDetailPanel(score: TrustScoreResult): HTMLElement {
  const panel = document.createElement("div");
  panel.className = DETAIL_CLASS;

  // Header with score
  const header = document.createElement("div");
  header.className = `${DETAIL_CLASS}-header`;

  const headerLabel = document.createElement("span");
  headerLabel.textContent = `${LABEL_EMOJI[score.label]} ${LABEL_TEXT[score.label]}`;
  header.appendChild(headerLabel);

  const scoreEl = document.createElement("span");
  scoreEl.className = `${DETAIL_CLASS}-score`;
  scoreEl.style.color = colorToHex(score.color);
  scoreEl.textContent = `${score.score}`;
  header.appendChild(scoreEl);

  panel.appendChild(header);

  // Positive signals
  if (score.positiveSignals.length > 0) {
    const section = document.createElement("div");
    section.className = `${DETAIL_CLASS}-section`;

    const title = document.createElement("div");
    title.className = `${DETAIL_CLASS}-section-title`;
    title.textContent = "✅ Trust Indicators";
    section.appendChild(title);

    for (const positive of score.positiveSignals) {
      const row = document.createElement("div");
      row.className = `${DETAIL_CLASS}-positive`;
      row.textContent = `+ ${positive}`;
      section.appendChild(row);
    }
    panel.appendChild(section);
  }

  // Negative signals (only show those with deductions)
  const activeSignals = score.signals.filter((s) => s.deduction > 0);
  if (activeSignals.length > 0) {
    const section = document.createElement("div");
    section.className = `${DETAIL_CLASS}-section`;

    const title = document.createElement("div");
    title.className = `${DETAIL_CLASS}-section-title`;
    title.textContent = "⚠️ Concerns Detected";
    section.appendChild(title);

    for (const signal of activeSignals) {
      section.appendChild(buildSignalRow(signal));
    }
    panel.appendChild(section);
  }

  // Meta info
  const meta = document.createElement("div");
  meta.className = `${DETAIL_CLASS}-meta`;
  meta.textContent = `Based on ${score.sampleSize} reviews · Deduction: ${score.totalDeduction}/${score.maxPossibleDeduction} pts`;
  panel.appendChild(meta);

  return panel;
}

function buildSignalRow(signal: TrustSignal): HTMLElement {
  const row = document.createElement("div");
  row.className = `${DETAIL_CLASS}-signal`;

  const icon = document.createElement("span");
  icon.className = `${DETAIL_CLASS}-signal-icon`;
  icon.textContent = SEVERITY_ICON[signal.severity];
  row.appendChild(icon);

  const text = document.createElement("span");
  text.className = `${DETAIL_CLASS}-signal-text`;
  text.textContent = signal.reason;
  row.appendChild(text);

  const deduction = document.createElement("span");
  deduction.className = `${DETAIL_CLASS}-signal-deduction`;
  const effective = Math.round(signal.deduction * signal.confidence * 10) / 10;
  deduction.textContent = `-${effective}`;
  deduction.style.color = signal.severity === "high" ? "#cc0c39"
    : signal.severity === "medium" ? "#e65100" : "#888";
  row.appendChild(deduction);

  return row;
}

function colorToHex(color: TrustScoreResult["color"]): string {
  switch (color) {
    case "green": return "#067d62";
    case "yellow": return "#b06000";
    case "orange": return "#e65100";
    case "red": return "#cc0c39";
  }
}
