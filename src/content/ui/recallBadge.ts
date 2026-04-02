/**
 * Recall Badge UI — shows a red warning badge on product cards
 * that match CPSC product recalls. Expandable to show details.
 */

import type { RecallMatch } from "../../recall/types";

export const RECALL_BADGE_STYLES = `
.bas-recall-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #fef2f2;
  border: 1px solid #cc0c39;
  border-radius: 4px;
  padding: 3px 8px;
  margin: 4px 0;
  font-size: 12px;
  font-weight: bold;
  color: #cc0c39;
  cursor: pointer;
  transition: background 0.2s;
}

.bas-recall-badge:hover {
  background: #fee2e2;
}

.bas-recall-badge-icon {
  font-size: 14px;
}

.bas-recall-detail {
  display: none;
  background: #fef2f2;
  border: 1px solid #f5c6cb;
  border-radius: 6px;
  padding: 10px;
  margin: 6px 0;
  font-size: 11px;
  line-height: 1.5;
  color: #333;
  max-width: 100%;
}

.bas-recall-detail.bas-recall-expanded {
  display: block;
}

.bas-recall-detail-title {
  font-weight: bold;
  font-size: 12px;
  color: #cc0c39;
  margin-bottom: 6px;
}

.bas-recall-detail-hazard {
  background: #fff3cd;
  border-left: 3px solid #ffc107;
  padding: 4px 8px;
  margin: 6px 0;
  font-size: 11px;
  color: #856404;
}

.bas-recall-detail-row {
  display: flex;
  gap: 6px;
  padding: 2px 0;
}

.bas-recall-detail-label {
  font-weight: bold;
  min-width: 60px;
  color: #555;
}

.bas-recall-detail-link {
  color: #0066c0;
  text-decoration: none;
  font-weight: bold;
}

.bas-recall-detail-link:hover {
  text-decoration: underline;
}

.bas-recall-confidence {
  font-size: 10px;
  color: #888;
  font-weight: normal;
  margin-left: 4px;
}
`;

/**
 * Inject a recall warning badge on a product card.
 * Shows the highest-confidence match with click-to-expand details.
 */
export function injectRecallBadge(card: HTMLElement, matches: RecallMatch[]): void {
  // Remove any existing badge
  removeRecallBadge(card);

  if (matches.length === 0) return;

  const topMatch = matches[0];
  const recall = topMatch.recall;

  // Badge
  const badge = document.createElement("div");
  badge.className = "bas-recall-badge";

  const icon = document.createElement("span");
  icon.className = "bas-recall-badge-icon";
  icon.textContent = "⚠️";
  badge.appendChild(icon);

  const text = document.createElement("span");
  text.textContent = "Product Recall";
  badge.appendChild(text);

  if (matches.length > 1) {
    const countEl = document.createElement("span");
    countEl.style.fontWeight = "normal";
    countEl.style.fontSize = "10px";
    countEl.textContent = `(${matches.length} recalls)`;
    badge.appendChild(countEl);
  }

  const confLabel = document.createElement("span");
  confLabel.className = "bas-recall-confidence";
  confLabel.textContent = topMatch.confidence >= 0.7 ? "High match"
    : topMatch.confidence >= 0.5 ? "Likely match"
    : "Possible match";
  badge.appendChild(confLabel);

  // Detail panel (collapsed)
  const detail = document.createElement("div");
  detail.className = "bas-recall-detail";

  for (let i = 0; i < Math.min(matches.length, 3); i++) {
    if (i > 0) {
      const separator = document.createElement("hr");
      separator.style.border = "none";
      separator.style.borderTop = "1px solid #e0e0e0";
      separator.style.margin = "8px 0";
      detail.appendChild(separator);
    }
    detail.appendChild(buildRecallDetail(matches[i]));
  }

  // Toggle on click
  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    detail.classList.toggle("bas-recall-expanded");
  });

  // Insert near the top of the card for visibility
  const anchor = card.querySelector("h2, .a-size-medium, .a-size-base-plus");
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(badge, anchor.nextSibling);
    anchor.parentElement.insertBefore(detail, badge.nextSibling);
  } else {
    card.prepend(detail);
    card.prepend(badge);
  }
}

function buildRecallDetail(match: RecallMatch): HTMLElement {
  const recall = match.recall;
  const container = document.createElement("div");

  // Title
  const title = document.createElement("div");
  title.className = "bas-recall-detail-title";
  title.textContent = recall.Title;
  container.appendChild(title);

  // Hazard
  if (recall.Hazards?.length > 0) {
    const hazard = document.createElement("div");
    hazard.className = "bas-recall-detail-hazard";
    hazard.textContent = `⚠️ Hazard: ${recall.Hazards.map((h) => h.Name).join("; ")}`;
    container.appendChild(hazard);
  }

  // Date
  const dateRow = document.createElement("div");
  dateRow.className = "bas-recall-detail-row";
  const dateLabel = document.createElement("span");
  dateLabel.className = "bas-recall-detail-label";
  dateLabel.textContent = "Date:";
  dateRow.appendChild(dateLabel);
  const dateVal = document.createElement("span");
  const recallDate = new Date(recall.RecallDate);
  dateVal.textContent = isNaN(recallDate.getTime())
    ? recall.RecallDate
    : recallDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  dateRow.appendChild(dateVal);
  container.appendChild(dateRow);

  // Products
  if (recall.Products?.length > 0) {
    const prodRow = document.createElement("div");
    prodRow.className = "bas-recall-detail-row";
    const prodLabel = document.createElement("span");
    prodLabel.className = "bas-recall-detail-label";
    prodLabel.textContent = "Product:";
    prodRow.appendChild(prodLabel);
    const prodVal = document.createElement("span");
    prodVal.textContent = recall.Products.map((p) => p.Name).join(", ");
    prodRow.appendChild(prodVal);
    container.appendChild(prodRow);
  }

  // Description (truncated)
  if (recall.Description) {
    const descRow = document.createElement("div");
    descRow.style.marginTop = "4px";
    descRow.style.fontSize = "10px";
    descRow.style.color = "#555";
    const desc = recall.Description.length > 200
      ? recall.Description.slice(0, 200) + "…"
      : recall.Description;
    descRow.textContent = desc;
    container.appendChild(descRow);
  }

  // CPSC Link
  if (recall.URL) {
    const linkRow = document.createElement("div");
    linkRow.style.marginTop = "6px";
    const link = document.createElement("a");
    link.className = "bas-recall-detail-link";
    link.href = recall.URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View full recall on CPSC.gov →";
    linkRow.appendChild(link);
    container.appendChild(linkRow);
  }

  // Confidence
  const confRow = document.createElement("div");
  confRow.style.marginTop = "4px";
  confRow.style.fontSize = "9px";
  confRow.style.color = "#999";
  confRow.textContent = `Match confidence: ${Math.round(match.confidence * 100)}% · Matched on: ${match.matchedOn.join(", ")}`;
  container.appendChild(confRow);

  return container;
}

/** Remove the recall badge from a card. */
export function removeRecallBadge(card: HTMLElement): void {
  card.querySelectorAll(".bas-recall-badge, .bas-recall-detail").forEach((el) => el.remove());
}
