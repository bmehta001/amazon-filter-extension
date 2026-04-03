/**
 * Product Score Badge — unified composite indicator replacing the separate
 * confidence, review, trust, seller, and listing quality badges.
 *
 * Shows colored dots + a summary label. Click expands a detail panel
 * with all constituent scores and their breakdowns.
 */

import type { TrustScoreResult } from "../../review/trustScore";
import type { SellerTrustResult } from "../../seller/trust";
import type { ListingIntegrityResult } from "../../seller/listingSignals";
import type { ReviewScore } from "../../review/types";
import type { ListingCompleteness } from "../../listing/completeness";
import type { DealScore } from "../dealScoring";
import type { BsrInfo } from "../../types";
import { COLORS, RADII, FONT, SPACE } from "./designTokens";

const BADGE_CLASS = "bas-product-score";
const PANEL_CLASS = "bas-product-score-panel";

export interface ProductScoreInput {
  reviewScore?: ReviewScore;
  reviewTrust?: TrustScoreResult;
  sellerTrust?: SellerTrustResult;
  listingIntegrity?: ListingIntegrityResult;
  listingCompleteness?: ListingCompleteness;
  dealScore?: DealScore;
  bsr?: BsrInfo;
}

/** Computed Red Flag Report from all available signals. */
export interface RedFlagReport {
  /** Overall verdict. */
  verdict: "low-risk" | "caution" | "high-risk";
  /** One-line recommendation. */
  recommendation: string;
  /** Top contributing red flags (max 3). */
  flags: string[];
  /** Top positive signals (max 2). */
  positives: string[];
}

export const PRODUCT_SCORE_STYLES = `
.${BADGE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: ${RADII.sm};
  background: ${COLORS.surface0};
  border: 1px solid ${COLORS.borderLight};
  margin: 4px 0;
  font-size: ${FONT.sm};
  font-family: ${FONT.family};
  line-height: 1.3;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.${BADGE_CLASS}:hover {
  background: ${COLORS.surface1};
}
.${BADGE_CLASS}-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.${BADGE_CLASS}-dot--green { background: ${COLORS.success}; }
.${BADGE_CLASS}-dot--yellow { background: #e0a800; }
.${BADGE_CLASS}-dot--orange { background: ${COLORS.warning}; }
.${BADGE_CLASS}-dot--red { background: ${COLORS.danger}; }
.${BADGE_CLASS}-dot--gray { background: #999; }
.${BADGE_CLASS}-label {
  font-weight: 600;
  color: ${COLORS.textPrimary};
}
.${BADGE_CLASS}-caret {
  font-size: 9px;
  color: ${COLORS.textMuted};
  transition: transform 0.2s;
}
.${BADGE_CLASS}-caret.open {
  transform: rotate(180deg);
}
.${BADGE_CLASS}-bsr {
  color: ${COLORS.textSecondary};
  font-size: 10px;
}
.${BADGE_CLASS}-sep {
  width: 1px;
  height: 12px;
  background: ${COLORS.borderLight};
}

/* Detail panel */
.${PANEL_CLASS} {
  display: none;
  background: ${COLORS.surface2};
  border: 1px solid ${COLORS.borderLight};
  border-radius: ${RADII.md};
  padding: ${SPACE[2]} ${SPACE[3]};
  margin: ${SPACE[1]} 0;
  font-family: ${FONT.family};
  font-size: ${FONT.sm};
  box-shadow: ${`0 2px 8px rgba(0,0,0,0.1)`};
}
.${PANEL_CLASS}.open {
  display: block;
}
.${PANEL_CLASS}-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid ${COLORS.surface1};
}
.${PANEL_CLASS}-row:last-child {
  border-bottom: none;
}
.${PANEL_CLASS}-row-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.${PANEL_CLASS}-row-label {
  flex: 1;
  color: ${COLORS.textPrimary};
  font-weight: 500;
}
.${PANEL_CLASS}-row-value {
  color: ${COLORS.textSecondary};
  font-size: 10px;
}
.${PANEL_CLASS}-row-bar {
  width: 50px;
  height: 4px;
  background: ${COLORS.surface1};
  border-radius: 2px;
  overflow: hidden;
}
.${PANEL_CLASS}-row-bar-fill {
  height: 100%;
  border-radius: 2px;
}
.${PANEL_CLASS}-row-reasons {
  padding-left: 16px;
  font-size: 10px;
  color: ${COLORS.textMuted};
  line-height: 1.5;
}
.${PANEL_CLASS}-row-reason {
  padding: 1px 0;
}
.${PANEL_CLASS}-verdict {
  padding: ${SPACE[2]} 0;
  border-bottom: 1px solid ${COLORS.borderLight};
  margin-bottom: ${SPACE[1]};
}
.${PANEL_CLASS}-verdict-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 12px;
}
.${PANEL_CLASS}-verdict--low-risk .${PANEL_CLASS}-verdict-line { color: ${COLORS.success}; }
.${PANEL_CLASS}-verdict--caution .${PANEL_CLASS}-verdict-line { color: ${COLORS.warning}; }
.${PANEL_CLASS}-verdict--high-risk .${PANEL_CLASS}-verdict-line { color: ${COLORS.danger}; }
.${PANEL_CLASS}-verdict-rec {
  font-size: 10px;
  color: ${COLORS.textSecondary};
  margin-top: 2px;
}
.${PANEL_CLASS}-verdict-flags {
  font-size: 10px;
  color: ${COLORS.textMuted};
  margin-top: ${SPACE[1]};
  line-height: 1.5;
}
`;

type DotColor = "green" | "yellow" | "orange" | "red" | "gray";

interface ScoreRow {
  icon: string;
  label: string;
  score: number;
  maxScore: number;
  color: DotColor;
  detail: string;
  /** Additional breakdown reasons (shown as sub-items in the panel). */
  reasons?: string[];
}

/**
 * Inject the unified Product Score badge onto a card.
 */
export function injectProductScore(card: HTMLElement, input: ProductScoreInput): void {
  removeProductScore(card);

  const rows = buildScoreRows(input);
  if (rows.length === 0) return;

  // Compute overall label from Red Flag Report
  const report = computeRedFlagReport(input);
  const overallLabel = report.verdict === "low-risk" ? "Low Risk"
    : report.verdict === "caution" ? "Caution"
    : "High Risk";
  const dots = rows.map((r) => r.color);

  // Badge
  const badge = document.createElement("div");
  badge.className = BADGE_CLASS;

  // Dots
  for (const dotColor of dots) {
    const dot = document.createElement("span");
    dot.className = `${BADGE_CLASS}-dot ${BADGE_CLASS}-dot--${dotColor}`;
    badge.appendChild(dot);
  }

  // Label
  const label = document.createElement("span");
  label.className = `${BADGE_CLASS}-label`;
  label.textContent = overallLabel;
  badge.appendChild(label);

  // Caret
  const caret = document.createElement("span");
  caret.className = `${BADGE_CLASS}-caret`;
  caret.textContent = "▾";
  badge.appendChild(caret);

  // BSR compact label
  if (input.bsr) {
    const sep = document.createElement("span");
    sep.className = `${BADGE_CLASS}-sep`;
    badge.appendChild(sep);
    const bsrLabel = document.createElement("span");
    bsrLabel.className = `${BADGE_CLASS}-bsr`;
    bsrLabel.textContent = `#${input.bsr.rank.toLocaleString()}`;
    bsrLabel.title = `BSR: #${input.bsr.rank.toLocaleString()} in ${input.bsr.category}`;
    badge.appendChild(bsrLabel);
  }

  // Tooltip
  const tooltipLines = rows.map((r) => `${r.icon} ${r.label}: ${r.score}/${r.maxScore} — ${r.detail}`);
  if (input.bsr) {
    tooltipLines.push(`📊 BSR: #${input.bsr.rank.toLocaleString()} in ${input.bsr.category}`);
  }
  badge.title = tooltipLines.join("\n");

  // Detail panel
  const panel = document.createElement("div");
  panel.className = PANEL_CLASS;
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Product score details");

  // Red Flag Report verdict at top of panel
  const redFlagReport = computeRedFlagReport(input);
  panel.appendChild(buildVerdictSection(redFlagReport));

  for (const row of rows) {
    panel.appendChild(createPanelRow(row));
  }

  if (input.bsr) {
    const bsrRow = document.createElement("div");
    bsrRow.className = `${PANEL_CLASS}-row`;
    bsrRow.innerHTML = `
      <span class="${PANEL_CLASS}-row-dot" style="background:${COLORS.info}"></span>
      <span class="${PANEL_CLASS}-row-label">📊 Best Sellers Rank</span>
      <span class="${PANEL_CLASS}-row-value">#${input.bsr.rank.toLocaleString()} in ${input.bsr.category}</span>
    `;
    panel.appendChild(bsrRow);
  }

  // Toggle panel on click
  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const isOpen = panel.classList.toggle("open");
    caret.classList.toggle("open", isOpen);
    badge.setAttribute("aria-expanded", String(isOpen));
  });

  badge.setAttribute("role", "button");
  badge.setAttribute("tabindex", "0");
  badge.setAttribute("aria-expanded", "false");
  badge.setAttribute("aria-label", `Product Score: ${overallLabel}. Click for details.`);

  // Keyboard support
  badge.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      badge.click();
    }
  });

  // Insert near the top of the card
  const anchor = card.querySelector("h2, .a-size-medium, .a-size-base-plus");
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(badge, anchor.nextSibling);
    badge.after(panel);
  } else {
    card.prepend(panel);
    card.prepend(badge);
  }
}

/** Remove the product score badge and panel from a card. */
export function removeProductScore(card: HTMLElement): void {
  card.querySelector(`.${BADGE_CLASS}`)?.remove();
  card.querySelector(`.${PANEL_CLASS}`)?.remove();
}

function buildScoreRows(input: ProductScoreInput): ScoreRow[] {
  const rows: ScoreRow[] = [];

  if (input.reviewTrust) {
    const rt = input.reviewTrust;
    const reasons: string[] = [];
    if (rt.signals) {
      for (const s of rt.signals) {
        reasons.push(`${s.severity === "high" ? "🚨" : "⚠️"} ${s.reason} (${s.deduction > 0 ? "-" : "+"}${Math.abs(s.deduction)})`);
      }
    }
    rows.push({
      icon: "🛡️",
      label: "Review Trust",
      score: rt.score,
      maxScore: 100,
      color: rt.color as DotColor,
      detail: capitalize(rt.label),
      reasons: reasons.length > 0 ? reasons : undefined,
    });
  }

  if (input.reviewScore) {
    const rs = input.reviewScore;
    rows.push({
      icon: "⭐",
      label: "Review Quality",
      score: rs.score,
      maxScore: 100,
      color: rs.label === "authentic" ? "green" : rs.label === "mixed" ? "yellow" : "red",
      detail: capitalize(rs.label),
      reasons: rs.breakdown?.reasons?.length ? rs.breakdown.reasons : undefined,
    });
  }

  if (input.sellerTrust) {
    const st = input.sellerTrust;
    const reasons: string[] = [];
    if (st.signals) {
      for (const s of st.signals) reasons.push(`${s.severity === "high" ? "🚨" : "⚠️"} ${s.reason}`);
    }
    rows.push({
      icon: "🏪",
      label: "Seller Trust",
      score: st.score,
      maxScore: 100,
      color: st.color as DotColor,
      detail: capitalize(st.label),
      reasons: reasons.length > 0 ? reasons : undefined,
    });
  }

  if (input.listingIntegrity) {
    const li = input.listingIntegrity;
    const reasons: string[] = [];
    if (li.signals) {
      for (const s of li.signals) reasons.push(`${s.points > 0 ? "✅" : "⚠️"} ${s.reason}`);
    }
    rows.push({
      icon: "📋",
      label: "Listing Integrity",
      score: li.score,
      maxScore: 100,
      color: li.color as DotColor,
      detail: capitalize(li.label),
      reasons: reasons.length > 0 ? reasons : undefined,
    });
  }

  if (input.listingCompleteness) {
    const lc = input.listingCompleteness;
    if (lc.missingImportantCount > 0) {
      rows.push({
        icon: "📝",
        label: "Listing Info",
        score: lc.score,
        maxScore: 100,
        color: lc.color as DotColor,
        detail: `${lc.missingImportantCount} key field${lc.missingImportantCount === 1 ? "" : "s"} missing`,
      });
    }
  }

  if (input.dealScore) {
    const ds = input.dealScore;
    const color: DotColor = ds.label === "Great Deal" ? "green"
      : ds.label === "Good Deal" ? "yellow"
      : ds.label === "Normal Price" ? "gray"
      : "red";
    rows.push({
      icon: "💰",
      label: "Deal Quality",
      score: ds.score,
      maxScore: 100,
      color,
      detail: ds.label,
    });
  }

  return rows;
}

function getOverallLabel(colors: DotColor[]): string {
  const reds = colors.filter((c) => c === "red").length;
  const greens = colors.filter((c) => c === "green").length;
  if (reds >= 2) return "Caution";
  if (greens >= colors.length * 0.6) return "Strong";
  if (greens >= 1 && reds === 0) return "Good";
  if (reds >= 1) return "Mixed";
  return "Fair";
}

function createPanelRow(row: ScoreRow): HTMLElement {
  const wrapper = document.createElement("div");

  const el = document.createElement("div");
  el.className = `${PANEL_CLASS}-row`;

  const dot = document.createElement("span");
  dot.className = `${PANEL_CLASS}-row-dot`;
  dot.style.background = dotColorToHex(row.color);

  const label = document.createElement("span");
  label.className = `${PANEL_CLASS}-row-label`;
  label.textContent = `${row.icon} ${row.label}`;

  const bar = document.createElement("span");
  bar.className = `${PANEL_CLASS}-row-bar`;
  const fill = document.createElement("span");
  fill.className = `${PANEL_CLASS}-row-bar-fill`;
  fill.style.width = `${Math.min(100, row.score)}%`;
  fill.style.background = dotColorToHex(row.color);
  bar.appendChild(fill);

  const value = document.createElement("span");
  value.className = `${PANEL_CLASS}-row-value`;
  value.textContent = `${row.score} — ${row.detail}`;

  el.appendChild(dot);
  el.appendChild(label);
  el.appendChild(bar);
  el.appendChild(value);
  wrapper.appendChild(el);

  // Render breakdown reasons if available
  if (row.reasons && row.reasons.length > 0) {
    const reasonsEl = document.createElement("div");
    reasonsEl.className = `${PANEL_CLASS}-row-reasons`;
    for (const reason of row.reasons) {
      const r = document.createElement("div");
      r.className = `${PANEL_CLASS}-row-reason`;
      r.textContent = reason;
      reasonsEl.appendChild(r);
    }
    wrapper.appendChild(reasonsEl);
  }

  return wrapper;
}

function dotColorToHex(color: DotColor): string {
  switch (color) {
    case "green": return COLORS.success;
    case "yellow": return "#e0a800";
    case "orange": return COLORS.warning;
    case "red": return COLORS.danger;
    case "gray": return "#999";
  }
}

/** Compute a Red Flag Report from all available signals. */
export function computeRedFlagReport(input: ProductScoreInput): RedFlagReport {
  const flags: string[] = [];
  const positives: string[] = [];

  // Review trust
  if (input.reviewTrust) {
    if (input.reviewTrust.score < 50) {
      flags.push(`Review trust is low (${input.reviewTrust.score}/100) — reviews may be manipulated`);
    } else if (input.reviewTrust.score >= 80) {
      positives.push(`Reviews appear authentic (${input.reviewTrust.score}/100)`);
    }
  }

  // Review quality
  if (input.reviewScore) {
    if (input.reviewScore.label === "suspicious") {
      flags.push(`Review quality flagged as suspicious (${input.reviewScore.score}/100)`);
    } else if (input.reviewScore.label === "authentic") {
      positives.push(`Review quality looks authentic`);
    }
  }

  // Seller trust
  if (input.sellerTrust) {
    if (input.sellerTrust.score < 50) {
      flags.push(`Seller trust is low (${input.sellerTrust.score}/100) — unknown or risky seller`);
    } else if (input.sellerTrust.score >= 75) {
      positives.push(`Trusted seller`);
    }
  }

  // Listing integrity
  if (input.listingIntegrity) {
    if (input.listingIntegrity.score < 45) {
      flags.push(`Listing integrity concern (${input.listingIntegrity.score}/100) — possible hijacked listing`);
    }
  }

  // Listing completeness
  if (input.listingCompleteness && input.listingCompleteness.missingImportantCount >= 3) {
    flags.push(`Listing missing ${input.listingCompleteness.missingImportantCount} key info fields`);
  }

  // Deal score
  if (input.dealScore) {
    if (input.dealScore.label === "Inflated Pricing" || input.dealScore.label === "Suspicious Discount") {
      flags.push(`Price may be inflated — deal score: ${input.dealScore.score}/100`);
    } else if (input.dealScore.label === "Great Deal") {
      positives.push(`Great deal detected (${input.dealScore.score}/100)`);
    }
  }

  // Determine verdict
  let verdict: RedFlagReport["verdict"];
  let recommendation: string;

  if (flags.length >= 3) {
    verdict = "high-risk";
    recommendation = "Multiple concerns detected. Consider alternatives or research further.";
  } else if (flags.length >= 1) {
    verdict = "caution";
    recommendation = "Some concerns found. Review the details before purchasing.";
  } else {
    verdict = "low-risk";
    recommendation = positives.length > 0
      ? "This product looks good across all checks."
      : "No significant concerns detected.";
  }

  return {
    verdict,
    recommendation,
    flags: flags.slice(0, 3),
    positives: positives.slice(0, 2),
  };
}

/** Build the Red Flag Report verdict section for the detail panel. */
function buildVerdictSection(report: RedFlagReport): HTMLElement {
  const section = document.createElement("div");
  section.className = `${PANEL_CLASS}-verdict ${PANEL_CLASS}-verdict--${report.verdict}`;

  const verdictLine = document.createElement("div");
  verdictLine.className = `${PANEL_CLASS}-verdict-line`;
  const icon = report.verdict === "low-risk" ? "✅"
    : report.verdict === "caution" ? "⚠️"
    : "🚫";
  const label = report.verdict === "low-risk" ? "Low Risk"
    : report.verdict === "caution" ? "Caution"
    : "High Risk";
  verdictLine.textContent = `${icon} ${label}`;
  section.appendChild(verdictLine);

  const rec = document.createElement("div");
  rec.className = `${PANEL_CLASS}-verdict-rec`;
  rec.textContent = report.recommendation;
  section.appendChild(rec);

  if (report.flags.length > 0 || report.positives.length > 0) {
    const details = document.createElement("div");
    details.className = `${PANEL_CLASS}-verdict-flags`;
    for (const flag of report.flags) {
      const line = document.createElement("div");
      line.textContent = `🚩 ${flag}`;
      details.appendChild(line);
    }
    for (const pos of report.positives) {
      const line = document.createElement("div");
      line.textContent = `✓ ${pos}`;
      details.appendChild(line);
    }
    section.appendChild(details);
  }

  return section;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
