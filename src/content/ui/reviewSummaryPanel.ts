/**
 * Enhanced review summary panel — collapsible detail view showing
 * pros/cons with ratings, representative quotes, and trend indicators.
 *
 * Replaces the simple one-liner with a click-to-expand panel.
 */

import type { ReviewSummary, ReviewAspect } from "../../review/summary";
import type { ProductInsights, CategorizedReview, TopicScore, CategorySummary } from "../../review/types";

/** Data bundle for rendering the panel. */
export interface SummaryPanelData {
  summary: ReviewSummary;
  insights?: ProductInsights;
}

// ── Styles ────────────────────────────────────────────────────────────

export const SUMMARY_PANEL_STYLES = `
.bas-review-summary {
  font-size: 11px;
  color: #565959;
  padding: 3px 0;
  line-height: 1.4;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  position: relative;
}
.bas-review-summary:hover {
  color: #0066c0;
}
.bas-review-summary::after {
  content: " ▸";
  font-size: 9px;
  opacity: 0.5;
}
.bas-review-summary--expanded::after {
  content: " ▾";
}

/* Panel */
.bas-summary-panel {
  display: none;
  margin: 4px 0 6px;
  padding: 8px 10px;
  background: #fafafa;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: #0f1111;
  max-width: 380px;
}
.bas-summary-panel--open {
  display: block;
}

/* Sections */
.bas-sp-section {
  margin-bottom: 6px;
}
.bas-sp-section:last-child {
  margin-bottom: 0;
}
.bas-sp-heading {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #565959;
  margin-bottom: 4px;
}

/* Aspect rows */
.bas-sp-aspect {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-size: 11px;
}
.bas-sp-aspect__label {
  font-weight: 500;
  min-width: 90px;
}
.bas-sp-aspect__rating {
  font-weight: 600;
  min-width: 32px;
  text-align: center;
}
.bas-sp-aspect__rating--high { color: #067d06; }
.bas-sp-aspect__rating--mid { color: #b7791f; }
.bas-sp-aspect__rating--low { color: #b12704; }
.bas-sp-aspect__bar {
  flex: 1;
  height: 6px;
  background: #e8e8e8;
  border-radius: 3px;
  overflow: hidden;
  min-width: 40px;
}
.bas-sp-aspect__fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}
.bas-sp-aspect__fill--high { background: #067d06; }
.bas-sp-aspect__fill--mid { background: #ddb347; }
.bas-sp-aspect__fill--low { background: #b12704; }
.bas-sp-aspect__meta {
  font-size: 10px;
  color: #888;
  white-space: nowrap;
}
.bas-sp-aspect__trend {
  font-size: 12px;
}

/* Quotes */
.bas-sp-quote {
  font-style: italic;
  font-size: 10.5px;
  color: #666;
  padding: 3px 0 3px 8px;
  border-left: 2px solid #ddd;
  margin: 3px 0;
  line-height: 1.4;
}

/* Sentiment bar */
.bas-sp-sentiment {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 10px;
  color: #888;
}
.bas-sp-sentiment__bar {
  flex: 1;
  height: 8px;
  background: #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
}
.bas-sp-sentiment__pos {
  background: #067d06;
  height: 100%;
}
.bas-sp-sentiment__neg {
  background: #b12704;
  height: 100%;
}
`;

// ── Panel rendering ───────────────────────────────────────────────────

/**
 * Inject an enhanced review summary with click-to-expand panel.
 */
export function injectSummaryPanel(
  card: HTMLElement,
  data: SummaryPanelData,
): void {
  // Remove any existing summary
  card.querySelector(".bas-review-summary")?.remove();
  card.querySelector(".bas-summary-panel")?.remove();

  const { summary, insights } = data;
  if (!summary.oneLiner) return;

  // One-liner (collapsed state)
  const oneLiner = document.createElement("div");
  oneLiner.className = "bas-review-summary";
  oneLiner.textContent = summary.oneLiner;
  oneLiner.title = "Click to expand review details";

  // Detail panel (hidden by default)
  const panel = document.createElement("div");
  panel.className = "bas-summary-panel";

  // Build panel content
  buildPanelContent(panel, summary, insights);

  // Toggle behavior
  oneLiner.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.contains("bas-summary-panel--open");
    panel.classList.toggle("bas-summary-panel--open", !isOpen);
    oneLiner.classList.toggle("bas-review-summary--expanded", !isOpen);
  });

  // Insert into DOM
  const anchor = card.querySelector(".bas-review-badge, .bas-card-actions, h2");
  if (anchor) {
    anchor.parentElement?.insertBefore(oneLiner, anchor.nextSibling);
    oneLiner.after(panel);
  } else {
    card.appendChild(oneLiner);
    card.appendChild(panel);
  }
}

function buildPanelContent(
  panel: HTMLElement,
  summary: ReviewSummary,
  insights?: ProductInsights,
): void {
  // Pros section
  if (summary.pros.length > 0) {
    const section = createSection("👍 What customers love");
    for (const aspect of summary.pros) {
      section.appendChild(createAspectRow(aspect, insights));
      appendQuote(section, aspect.label, insights);
    }
    panel.appendChild(section);
  }

  // Cons section
  if (summary.cons.length > 0) {
    const section = createSection("👎 Common complaints");
    for (const aspect of summary.cons) {
      section.appendChild(createAspectRow(aspect, insights));
      appendQuote(section, aspect.label, insights);
    }
    panel.appendChild(section);
  }

  // Overall sentiment bar
  if (summary.pros.length > 0 || summary.cons.length > 0) {
    panel.appendChild(createSentimentBar(summary));
  }
}

function createSection(title: string): HTMLElement {
  const section = document.createElement("div");
  section.className = "bas-sp-section";
  const heading = document.createElement("div");
  heading.className = "bas-sp-heading";
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

function createAspectRow(aspect: ReviewAspect, insights?: ProductInsights): HTMLElement {
  const row = document.createElement("div");
  row.className = "bas-sp-aspect";

  // Label
  const label = document.createElement("span");
  label.className = "bas-sp-aspect__label";
  label.textContent = aspect.label;
  row.appendChild(label);

  // Rating number
  const rating = document.createElement("span");
  const ratingTier = aspect.avgRating >= 4 ? "high" : aspect.avgRating >= 3 ? "mid" : "low";
  rating.className = `bas-sp-aspect__rating bas-sp-aspect__rating--${ratingTier}`;
  rating.textContent = `${aspect.avgRating.toFixed(1)}★`;
  row.appendChild(rating);

  // Rating bar
  const barOuter = document.createElement("div");
  barOuter.className = "bas-sp-aspect__bar";
  const barInner = document.createElement("div");
  barInner.className = `bas-sp-aspect__fill bas-sp-aspect__fill--${ratingTier}`;
  barInner.style.width = `${(aspect.avgRating / 5) * 100}%`;
  barOuter.appendChild(barInner);
  row.appendChild(barOuter);

  // Meta (mentions)
  const meta = document.createElement("span");
  meta.className = "bas-sp-aspect__meta";
  meta.textContent = `${aspect.mentions}×`;
  row.appendChild(meta);

  // Trend indicator
  if (aspect.trend) {
    const trend = document.createElement("span");
    trend.className = "bas-sp-aspect__trend";
    trend.textContent = aspect.trend === "rising" ? "📈" : aspect.trend === "falling" ? "📉" : "➡️";
    trend.title = `Trend: ${aspect.trend}`;
    row.appendChild(trend);
  }

  return row;
}

/**
 * Find a representative quote for an aspect from categorized reviews.
 */
function appendQuote(
  container: HTMLElement,
  aspectLabel: string,
  insights?: ProductInsights,
): void {
  if (!insights?.categorizedReviews) return;

  const quote = findBestQuote(aspectLabel, insights.categorizedReviews, insights.categorySummaries);
  if (!quote) return;

  const quoteEl = document.createElement("div");
  quoteEl.className = "bas-sp-quote";
  quoteEl.textContent = `"${quote}"`;
  container.appendChild(quoteEl);
}

/** Map aspect labels to category IDs for quote lookup. */
const LABEL_TO_CATEGORY: Record<string, string> = {
  "product quality": "product-quality",
  "performance": "performance",
  "durability": "durability",
  "ease of use": "ease-of-use",
  "value for money": "value",
  "size & fit": "size-fit",
  "appearance": "appearance",
  "compatibility": "compatibility",
  "shipping & delivery": "shipping-delivery",
  "customer service": "customer-service",
  "packaging & condition": "packaging",
  "user expectations/error": "user-error",
  // Keyword-based aspects from summary.ts
  "sound quality": "performance",
  "battery life": "performance",
  "comfort": "ease-of-use",
  "build quality": "product-quality",
  "picture quality": "performance",
  "delivery": "shipping-delivery",
  "size": "size-fit",
  "taste": "product-quality",
  "smell": "product-quality",
  "connectivity": "compatibility",
  "cleaning": "ease-of-use",
  "safety": "product-quality",
};

function findBestQuote(
  aspectLabel: string,
  categorizedReviews: CategorizedReview[],
  categorySummaries?: CategorySummary[],
): string | null {
  const categoryId = LABEL_TO_CATEGORY[aspectLabel.toLowerCase()];

  // Try category-matched snippet first
  if (categorySummaries && categoryId) {
    const summary = categorySummaries.find((s) => s.categoryId === categoryId);
    if (summary?.sampleSnippet && summary.sampleSnippet.length > 15) {
      return trimQuote(summary.sampleSnippet);
    }
  }

  // Fall back to keyword search in categorized reviews
  const labelWords = aspectLabel.toLowerCase().split(/\s+/);
  for (const cr of categorizedReviews) {
    for (const sent of cr.sentences) {
      const lower = sent.text.toLowerCase();
      if (labelWords.some((w) => lower.includes(w)) && sent.text.length >= 20 && sent.text.length <= 150) {
        return trimQuote(sent.text);
      }
    }
  }

  return null;
}

function trimQuote(text: string): string {
  const cleaned = text.trim().replace(/^["']|["']$/g, "");
  if (cleaned.length > 120) return cleaned.slice(0, 119) + "…";
  return cleaned;
}

function createSentimentBar(summary: ReviewSummary): HTMLElement {
  const total = summary.pros.length + summary.cons.length;
  const posPercent = total > 0 ? (summary.pros.length / total) * 100 : 50;

  const wrapper = document.createElement("div");
  wrapper.className = "bas-sp-sentiment";

  const posLabel = document.createElement("span");
  posLabel.textContent = `${summary.pros.length} pros`;
  wrapper.appendChild(posLabel);

  const bar = document.createElement("div");
  bar.className = "bas-sp-sentiment__bar";

  const posFill = document.createElement("div");
  posFill.className = "bas-sp-sentiment__pos";
  posFill.style.width = `${posPercent}%`;
  bar.appendChild(posFill);

  const negFill = document.createElement("div");
  negFill.className = "bas-sp-sentiment__neg";
  negFill.style.width = `${100 - posPercent}%`;
  bar.appendChild(negFill);

  wrapper.appendChild(bar);

  const negLabel = document.createElement("span");
  negLabel.textContent = `${summary.cons.length} cons`;
  wrapper.appendChild(negLabel);

  return wrapper;
}

/**
 * Remove summary panel from a card.
 */
export function removeSummaryPanel(card: HTMLElement): void {
  card.querySelector(".bas-review-summary")?.remove();
  card.querySelector(".bas-summary-panel")?.remove();
}
