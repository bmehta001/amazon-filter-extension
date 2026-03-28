import type { ListingCompleteness, ListingField } from "../../listing/completeness";

const BADGE_CLASS = "bas-listing-quality";

/** CSS styles for the listing quality badge. */
export const LISTING_QUALITY_STYLES = `
.${BADGE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  margin-top: 3px;
  transition: background 0.15s;
}

.${BADGE_CLASS}[data-color="green"] {
  background: #e6f7e6;
  color: #067d62;
  border: 1px solid #c8e6c9;
}

.${BADGE_CLASS}[data-color="gray"] {
  background: #f5f5f5;
  color: #565959;
  border: 1px solid #e0e0e0;
}

.${BADGE_CLASS}[data-color="orange"] {
  background: #fff3e0;
  color: #b36b00;
  border: 1px solid #ffe0b2;
}

.${BADGE_CLASS}[data-color="red"] {
  background: #fde8e8;
  color: #cc0c39;
  border: 1px solid #f5c6cb;
}

.${BADGE_CLASS}:hover {
  filter: brightness(0.95);
}

.bas-lq-panel {
  display: none;
  margin-top: 4px;
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  line-height: 1.5;
}

.bas-lq-panel.open {
  display: block;
}

.bas-lq-section-title {
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #565959;
  margin: 6px 0 2px;
}

.bas-lq-section-title:first-child {
  margin-top: 0;
}

.bas-lq-field {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 0;
}

.bas-lq-field-icon {
  font-size: 10px;
  width: 14px;
  text-align: center;
}

.bas-lq-field-label {
  color: #0f1111;
}

.bas-lq-field--missing .bas-lq-field-label {
  color: #888c8c;
}

.bas-lq-field--missing.bas-lq-field--required .bas-lq-field-label {
  color: #cc0c39;
}

.bas-lq-score-bar {
  height: 4px;
  background: #e7e8ea;
  border-radius: 2px;
  margin-top: 4px;
  overflow: hidden;
}

.bas-lq-score-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}
`;

/**
 * Inject listing quality badge onto a product card.
 */
export function injectListingQualityBadge(
  card: HTMLElement,
  completeness: ListingCompleteness,
): void {
  // Don't inject twice
  removeListingQualityBadge(card);

  // Don't show badge for complete listings (just noise)
  if (completeness.label === "complete" && completeness.missingImportantCount === 0) return;

  const badge = document.createElement("span");
  badge.className = BADGE_CLASS;
  badge.setAttribute("data-color", completeness.color);

  const icon = completeness.label === "complete" ? "✅"
    : completeness.label === "good" ? "📋"
    : completeness.label === "sparse" ? "⚠️"
    : "🚩";

  const missingLabel = completeness.missingImportantCount > 0
    ? `${completeness.missingImportantCount} missing`
    : `${completeness.presentCount}/${completeness.totalCount}`;

  badge.textContent = `${icon} Listing: ${missingLabel}`;
  badge.title = `Listing completeness: ${completeness.score}% — Click for details`;

  // Expandable detail panel
  const panel = document.createElement("div");
  panel.className = "bas-lq-panel";
  panel.appendChild(buildFieldList(completeness));

  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    panel.classList.toggle("open");
  });

  // Insert near title area
  const anchor =
    card.querySelector(".bas-confidence-badge") ??
    card.querySelector(".bas-review-badge") ??
    card.querySelector("h2")?.closest(".a-section") ??
    card.querySelector("h2")?.parentElement;

  if (anchor && anchor !== card) {
    anchor.after(badge);
    badge.after(panel);
  } else {
    card.appendChild(badge);
    card.appendChild(panel);
  }
}

/** Remove listing quality badge from a card. */
export function removeListingQualityBadge(card: HTMLElement): void {
  card.querySelector(`.${BADGE_CLASS}`)?.remove();
  card.querySelector(".bas-lq-panel")?.remove();
}

function buildFieldList(completeness: ListingCompleteness): HTMLElement {
  const container = document.createElement("div");

  // Score bar
  const scoreBar = document.createElement("div");
  scoreBar.className = "bas-lq-score-bar";
  const fill = document.createElement("div");
  fill.className = "bas-lq-score-fill";
  fill.style.width = `${completeness.score}%`;
  fill.style.background = completeness.color === "green" ? "#067d62"
    : completeness.color === "gray" ? "#888c8c"
    : completeness.color === "orange" ? "#b36b00"
    : "#cc0c39";
  scoreBar.appendChild(fill);
  container.appendChild(scoreBar);

  const scoreLabel = document.createElement("div");
  scoreLabel.style.cssText = "font-size:10px;color:#565959;margin:2px 0 4px;";
  scoreLabel.textContent = `${completeness.score}% complete · ${completeness.presentCount} of ${completeness.totalCount} fields present`;
  container.appendChild(scoreLabel);

  // Group fields by importance
  const groups: [string, ListingField[]][] = [
    ["Missing (Required)", completeness.fields.filter((f) => !f.present && f.importance === "required")],
    ["Missing (Recommended)", completeness.fields.filter((f) => !f.present && f.importance === "recommended")],
    ["Present", completeness.fields.filter((f) => f.present)],
    ["Missing (Optional)", completeness.fields.filter((f) => !f.present && f.importance === "optional")],
  ];

  for (const [title, fields] of groups) {
    if (fields.length === 0) continue;
    const titleEl = document.createElement("div");
    titleEl.className = "bas-lq-section-title";
    titleEl.textContent = title;
    container.appendChild(titleEl);

    for (const field of fields) {
      const row = document.createElement("div");
      row.className = "bas-lq-field";
      if (!field.present) {
        row.classList.add("bas-lq-field--missing");
        if (field.importance === "required") row.classList.add("bas-lq-field--required");
      }

      const iconEl = document.createElement("span");
      iconEl.className = "bas-lq-field-icon";
      iconEl.textContent = field.present ? "✓" : "✗";

      const label = document.createElement("span");
      label.className = "bas-lq-field-label";
      label.textContent = field.label;

      row.appendChild(iconEl);
      row.appendChild(label);
      container.appendChild(row);
    }
  }

  return container;
}
