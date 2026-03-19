import type { ProductInsights, CategorySummary, TopicScore } from "../../review/types";
import { REVIEW_CATEGORIES, type ReviewCategory } from "../../review/categories";
import { buildRadarChart } from "./radarChart";

const PANEL_CLASS = "bas-insights-panel";

/** CSS styles for review insights (to be injected into page global styles). */
export const REVIEW_INSIGHTS_STYLES = `
.${PANEL_CLASS} {
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 8px;
  margin-top: 6px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  color: #333;
}

.bas-insights-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 13px;
  font-weight: bold;
  user-select: none;
  gap: 6px;
}

.bas-insights-header:hover {
  color: #0066c0;
}

.bas-insights-header-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bas-insights-adjusted-badge {
  font-size: 11px;
  font-weight: normal;
  color: #067d62;
  margin-left: 6px;
}

.bas-insights-toggle {
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
}

.bas-insights-body {
  display: none;
  margin-top: 8px;
}

.bas-insights-body.bas-insights-expanded {
  display: block;
}

.bas-insights-category-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 11px;
}

.bas-insights-category-row.bas-insights-non-product {
  opacity: 0.6;
  font-style: italic;
}

.bas-insights-cat-icon {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.bas-insights-cat-label {
  flex-shrink: 0;
  width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bas-insights-bar-container {
  flex: 1;
  height: 6px;
  background: #e9ecef;
  border-radius: 3px;
  overflow: hidden;
  min-width: 40px;
}

.bas-insights-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.bas-insights-cat-count {
  flex-shrink: 0;
  white-space: nowrap;
  color: #555;
  font-size: 10px;
  min-width: 80px;
}

.bas-insights-cat-rating {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 10px;
  min-width: 30px;
  text-align: right;
}

.bas-insights-non-product-tag {
  font-size: 9px;
  color: #999;
  margin-left: 2px;
}

.bas-insights-summary {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #e0e0e0;
  font-size: 11px;
  color: #555;
}

.bas-topic-scores {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #e0e0e0;
}

.bas-topic-scores-header {
  font-size: 11px;
  font-weight: bold;
  color: #333;
  margin-bottom: 4px;
}

.bas-topic-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  font-size: 11px;
}

.bas-topic-label {
  width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #333;
}

.bas-topic-bar-container {
  flex: 1;
  height: 8px;
  background: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
  min-width: 40px;
  position: relative;
}

.bas-topic-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.bas-topic-rating {
  width: 32px;
  text-align: right;
  font-size: 10px;
  flex-shrink: 0;
}

.bas-topic-trend {
  width: 14px;
  text-align: center;
  font-size: 11px;
  flex-shrink: 0;
}

.bas-topic-sentiment {
  width: 14px;
  text-align: center;
  font-size: 10px;
  flex-shrink: 0;
}

.bas-topic-mentions {
  width: 50px;
  text-align: right;
  font-size: 10px;
  color: #888;
  flex-shrink: 0;
}
`;

function getBarColor(avgRating: number): string {
  if (avgRating >= 4.0) return "#28a745";
  if (avgRating >= 3.0) return "#ffc107";
  return "#dc3545";
}

function formatRating(rating: number): string {
  return `★${rating.toFixed(1)}`;
}

function getCategoryMeta(categoryId: string): ReviewCategory | undefined {
  return REVIEW_CATEGORIES.find((c) => c.id === categoryId);
}

function buildCategoryRow(summary: CategorySummary): HTMLElement {
  const meta = getCategoryMeta(summary.categoryId);
  const isProductRelated = meta?.isProductRelated ?? true;

  const row = document.createElement("div");
  row.className = "bas-insights-category-row";
  if (!isProductRelated) {
    row.classList.add("bas-insights-non-product");
  }

  // Icon
  const icon = document.createElement("span");
  icon.className = "bas-insights-cat-icon";
  icon.textContent = meta?.icon ?? "•";
  row.appendChild(icon);

  // Label
  const label = document.createElement("span");
  label.className = "bas-insights-cat-label";
  label.textContent = meta?.label ?? summary.categoryId;
  label.title = meta?.description ?? "";
  row.appendChild(label);

  // Bar
  const barContainer = document.createElement("span");
  barContainer.className = "bas-insights-bar-container";
  const barFill = document.createElement("span");
  barFill.className = "bas-insights-bar-fill";
  barFill.style.width = `${Math.min(summary.percentage, 100)}%`;
  barFill.style.backgroundColor = getBarColor(summary.avgRating);
  barContainer.appendChild(barFill);
  row.appendChild(barContainer);

  // Count
  const count = document.createElement("span");
  count.className = "bas-insights-cat-count";
  count.textContent = `${summary.count} reviews (${Math.round(summary.percentage)}%)`;
  row.appendChild(count);

  // Rating
  const rating = document.createElement("span");
  rating.className = "bas-insights-cat-rating";
  rating.textContent = formatRating(summary.avgRating);
  rating.style.color = getBarColor(summary.avgRating);
  row.appendChild(rating);

  // Non-product tag
  if (!isProductRelated) {
    const tag = document.createElement("span");
    tag.className = "bas-insights-non-product-tag";
    tag.textContent = "(non-product)";
    row.appendChild(tag);
  }

  return row;
}

function getExcludedCategoryLabels(ignoredCategories: string[]): string[] {
  return ignoredCategories
    .map((id) => getCategoryMeta(id)?.label)
    .filter((label): label is string => label != null);
}

function getTrendIcon(trend?: "rising" | "falling" | "stable"): string {
  if (trend === "rising") return "↑";
  if (trend === "falling") return "↓";
  if (trend === "stable") return "→";
  return "";
}

function getTrendColor(trend?: "rising" | "falling" | "stable"): string {
  if (trend === "rising") return "#28a745";
  if (trend === "falling") return "#dc3545";
  return "#888";
}

function getSentimentIcon(sentiment: "positive" | "mixed" | "negative"): string {
  if (sentiment === "positive") return "👍";
  if (sentiment === "negative") return "👎";
  return "➖";
}

function buildTopicRow(topic: TopicScore): HTMLElement {
  const meta = getCategoryMeta(topic.categoryId);
  const row = document.createElement("div");
  row.className = "bas-topic-row";

  // Sentiment icon
  const sentimentEl = document.createElement("span");
  sentimentEl.className = "bas-topic-sentiment";
  sentimentEl.textContent = getSentimentIcon(topic.sentiment);
  row.appendChild(sentimentEl);

  // Label
  const label = document.createElement("span");
  label.className = "bas-topic-label";
  label.textContent = meta?.label ?? topic.categoryId;
  label.title = meta?.description ?? "";
  row.appendChild(label);

  // Bar
  const barContainer = document.createElement("span");
  barContainer.className = "bas-topic-bar-container";
  const barFill = document.createElement("span");
  barFill.className = "bas-topic-bar-fill";
  barFill.style.width = `${(topic.avgRating / 5) * 100}%`;
  barFill.style.backgroundColor = getBarColor(topic.avgRating);
  barContainer.appendChild(barFill);
  row.appendChild(barContainer);

  // Rating
  const rating = document.createElement("span");
  rating.className = "bas-topic-rating";
  rating.textContent = formatRating(topic.avgRating);
  rating.style.color = getBarColor(topic.avgRating);
  row.appendChild(rating);

  // Trend
  const trend = document.createElement("span");
  trend.className = "bas-topic-trend";
  trend.textContent = getTrendIcon(topic.trend);
  trend.style.color = getTrendColor(topic.trend);
  if (topic.trend) {
    trend.title = `Trend: ${topic.trend} (compared to previous quarter)`;
  }
  row.appendChild(trend);

  // Mentions
  const mentions = document.createElement("span");
  mentions.className = "bas-topic-mentions";
  mentions.textContent = `${topic.reviewMentions} review${topic.reviewMentions !== 1 ? "s" : ""}`;
  row.appendChild(mentions);

  return row;
}

function buildTopicScoresSection(topicScores: TopicScore[]): HTMLElement {
  const section = document.createElement("div");
  section.className = "bas-topic-scores";

  const header = document.createElement("div");
  header.className = "bas-topic-scores-header";
  header.textContent = "📈 Topic Breakdown";
  section.appendChild(header);

  // Show top 6 topics by review mentions
  const displayed = topicScores.slice(0, 6);
  for (const topic of displayed) {
    section.appendChild(buildTopicRow(topic));
  }

  return section;
}

/** Inject or update the review insights panel on a product card. */
export function injectReviewInsights(
  card: HTMLElement,
  insights: ProductInsights,
  ignoredCategories: string[],
): void {
  // Remove existing panel if present
  removeReviewInsights(card);

  const panel = document.createElement("div");
  panel.className = PANEL_CLASS;

  // --- Header ---
  const header = document.createElement("div");
  header.className = "bas-insights-header";

  const headerLeft = document.createElement("span");
  headerLeft.className = "bas-insights-header-left";
  headerLeft.textContent = "📊 Review Insights";

  // Adjusted rating badge in header (if categories are excluded)
  if (ignoredCategories.length > 0) {
    const excludedLabels = getExcludedCategoryLabels(ignoredCategories);
    const badge = document.createElement("span");
    badge.className = "bas-insights-adjusted-badge";
    badge.textContent = `Adjusted: ${formatRating(insights.adjustedRating)} (excl. ${excludedLabels.join(", ")})`;
    headerLeft.appendChild(badge);
  }

  const toggle = document.createElement("span");
  toggle.className = "bas-insights-toggle";
  toggle.textContent = "▸";

  header.appendChild(headerLeft);
  header.appendChild(toggle);
  panel.appendChild(header);

  // --- Body (collapsed by default) ---
  const body = document.createElement("div");
  body.className = "bas-insights-body";

  // Category rows
  for (const summary of insights.categorySummaries) {
    body.appendChild(buildCategoryRow(summary));
  }

  // Summary line
  const summaryLine = document.createElement("div");
  summaryLine.className = "bas-insights-summary";
  if (ignoredCategories.length > 0) {
    summaryLine.textContent =
      `Adjusted rating: ${formatRating(insights.adjustedRating)} based on ` +
      `${insights.adjustedReviewCount} reviews (excluding ${ignoredCategories.length} ` +
      `categor${ignoredCategories.length === 1 ? "y" : "ies"})`;
  } else {
    summaryLine.textContent =
      `Rating: ${formatRating(insights.adjustedRating)} based on ` +
      `${insights.adjustedReviewCount} reviews`;
  }
  body.appendChild(summaryLine);

  // Radar chart visualization (when ≥3 topics exist)
  if (insights.topicScores && insights.topicScores.length >= 3) {
    body.appendChild(buildRadarChart(insights.topicScores));
  }

  // Per-topic breakdown section (sentence-level analysis)
  if (insights.topicScores && insights.topicScores.length > 0) {
    body.appendChild(buildTopicScoresSection(insights.topicScores));
  }

  panel.appendChild(body);

  // Toggle expand/collapse
  header.addEventListener("click", () => {
    const isExpanded = body.classList.toggle("bas-insights-expanded");
    toggle.textContent = isExpanded ? "▾" : "▸";
  });

  card.appendChild(panel);
}

/** Remove the review insights panel from a card. */
export function removeReviewInsights(card: HTMLElement): void {
  const existing = card.querySelector(`.${PANEL_CLASS}`);
  if (existing) {
    existing.remove();
  }
}
