/**
 * Unified Reviews Section — merges review summary, review insights,
 * and review gallery into a single collapsible section on product cards.
 *
 * Hierarchy: Summary (pros/cons) → Insights (topic breakdown) → Gallery (photos).
 * Single click to expand/collapse the entire section.
 */

import type { ReviewSummary, ReviewAspect } from "../../review/summary";
import type { ProductInsights, TopicScore } from "../../review/types";
import type { ReviewMediaGallery, ReviewMedia } from "../../review/types";
import { COLORS, RADII, FONT, SPACE } from "./designTokens";

const SECTION_CLASS = "bas-reviews-section";
const MAX_GALLERY_THUMBS = 6;

export interface UnifiedReviewData {
  summary?: ReviewSummary;
  insights?: ProductInsights;
  mediaGallery?: ReviewMediaGallery;
  ignoredCategories?: string[];
}

export const UNIFIED_REVIEW_STYLES = `
.${SECTION_CLASS} {
  margin: ${SPACE[1]} 0;
  font-family: ${FONT.family};
  font-size: ${FONT.sm};
}
.${SECTION_CLASS}-header {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  color: ${COLORS.textSecondary};
  font-weight: 600;
  font-size: ${FONT.sm};
  padding: 2px 0;
}
.${SECTION_CLASS}-header:hover {
  color: ${COLORS.info};
}
.${SECTION_CLASS}-caret {
  font-size: 9px;
  transition: transform 0.2s;
}
.${SECTION_CLASS}-caret.open {
  transform: rotate(90deg);
}
.${SECTION_CLASS}-meta {
  font-weight: 400;
  color: ${COLORS.textMuted};
  font-size: 10px;
}
.${SECTION_CLASS}-body {
  display: none;
  background: ${COLORS.surface0};
  border: 1px solid ${COLORS.borderLight};
  border-radius: ${RADII.md};
  padding: ${SPACE[2]};
  margin-top: ${SPACE[1]};
}
.${SECTION_CLASS}-body.open {
  display: block;
}

/* Summary sub-section */
.${SECTION_CLASS}-summary {
  margin-bottom: ${SPACE[2]};
}
.${SECTION_CLASS}-pros-cons {
  display: flex;
  gap: ${SPACE[3]};
  flex-wrap: wrap;
}
.${SECTION_CLASS}-pros,
.${SECTION_CLASS}-cons {
  flex: 1;
  min-width: 120px;
}
.${SECTION_CLASS}-sub-title {
  font-weight: 600;
  font-size: ${FONT.sm};
  color: ${COLORS.textPrimary};
  margin-bottom: 2px;
}
.${SECTION_CLASS}-aspect {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 0;
  font-size: ${FONT.sm};
  color: ${COLORS.textSecondary};
}
.${SECTION_CLASS}-aspect-rating {
  font-size: 10px;
  font-weight: 600;
}
.${SECTION_CLASS}-aspect-rating--good { color: ${COLORS.success}; }
.${SECTION_CLASS}-aspect-rating--bad { color: ${COLORS.danger}; }
.${SECTION_CLASS}-aspect-trend {
  font-size: 9px;
  color: ${COLORS.textMuted};
}
.${SECTION_CLASS}-dept {
  font-size: 10px;
  color: ${COLORS.info};
  margin-bottom: ${SPACE[1]};
}

/* Insights sub-section */
.${SECTION_CLASS}-insights {
  border-top: 1px solid ${COLORS.borderLight};
  padding-top: ${SPACE[2]};
  margin-top: ${SPACE[2]};
}
.${SECTION_CLASS}-topic {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  font-size: ${FONT.sm};
}
.${SECTION_CLASS}-topic-bar {
  width: 40px;
  height: 3px;
  background: ${COLORS.surface1};
  border-radius: 2px;
  overflow: hidden;
}
.${SECTION_CLASS}-topic-bar-fill {
  height: 100%;
  border-radius: 2px;
}
.${SECTION_CLASS}-topic-label {
  flex: 1;
  color: ${COLORS.textPrimary};
}
.${SECTION_CLASS}-topic-score {
  font-size: 10px;
  color: ${COLORS.textMuted};
}

/* Gallery sub-section */
.${SECTION_CLASS}-gallery {
  border-top: 1px solid ${COLORS.borderLight};
  padding-top: ${SPACE[2]};
  margin-top: ${SPACE[2]};
}
.${SECTION_CLASS}-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 44px);
  gap: 3px;
}
.${SECTION_CLASS}-gallery-thumb {
  width: 42px;
  height: 42px;
  border-radius: 3px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid ${COLORS.border};
  position: relative;
}
.${SECTION_CLASS}-gallery-thumb:hover {
  border-color: ${COLORS.info};
}
.${SECTION_CLASS}-gallery-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.${SECTION_CLASS}-gallery-thumb-verified {
  position: absolute;
  top: 1px;
  right: 1px;
  background: ${COLORS.success};
  color: #fff;
  font-size: 7px;
  padding: 1px 2px;
  border-radius: 2px;
  line-height: 1;
}
.${SECTION_CLASS}-gallery-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px dashed ${COLORS.border};
  border-radius: 3px;
  font-size: 10px;
  color: ${COLORS.info};
  cursor: pointer;
}
`;

/**
 * Inject the unified reviews section onto a product card.
 */
export function injectUnifiedReviews(
  card: HTMLElement,
  data: UnifiedReviewData,
): void {
  removeUnifiedReviews(card);

  const hasSummary = data.summary && (data.summary.pros.length > 0 || data.summary.cons.length > 0);
  const hasInsights = data.insights && data.insights.topicScores.length > 0;
  const hasMedia = data.mediaGallery && data.mediaGallery.items.length > 0;

  if (!hasSummary && !hasInsights && !hasMedia) return;

  const section = document.createElement("div");
  section.className = SECTION_CLASS;

  // Header
  const header = document.createElement("div");
  header.className = `${SECTION_CLASS}-header`;
  header.setAttribute("role", "button");
  header.setAttribute("tabindex", "0");
  header.setAttribute("aria-expanded", "false");

  const caret = document.createElement("span");
  caret.className = `${SECTION_CLASS}-caret`;
  caret.textContent = "▸";

  const headerLabel = document.createElement("span");
  headerLabel.textContent = "Reviews";

  // Meta info
  const meta = document.createElement("span");
  meta.className = `${SECTION_CLASS}-meta`;
  const metaParts: string[] = [];
  if (data.summary?.oneLiner) {
    metaParts.push(data.summary.oneLiner.slice(0, 60));
  }
  if (hasMedia) {
    const imgCount = data.mediaGallery!.items.filter((i) => i.type === "image").length;
    if (imgCount > 0) metaParts.push(`${imgCount} photo${imgCount !== 1 ? "s" : ""}`);
  }
  meta.textContent = metaParts.length > 0 ? `— ${metaParts.join(" · ")}` : "";

  header.appendChild(caret);
  header.appendChild(headerLabel);
  header.appendChild(meta);

  // Body
  const body = document.createElement("div");
  body.className = `${SECTION_CLASS}-body`;

  if (hasSummary) body.appendChild(buildSummarySection(data.summary!));
  if (hasInsights) body.appendChild(buildInsightsSection(data.insights!, data.ignoredCategories ?? []));
  if (hasMedia) body.appendChild(buildGallerySection(data.mediaGallery!));

  // Toggle
  header.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = body.classList.toggle("open");
    caret.classList.toggle("open", isOpen);
    header.setAttribute("aria-expanded", String(isOpen));
  });
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); header.click(); }
  });

  section.appendChild(header);
  section.appendChild(body);

  // Insert after product score or after h2
  const anchor =
    card.querySelector(".bas-price-intel") ??
    card.querySelector(".bas-product-score-panel") ??
    card.querySelector(".bas-product-score") ??
    card.querySelector("h2")?.closest(".a-section") ??
    card.querySelector("h2")?.parentElement;

  if (anchor && anchor !== card) {
    anchor.after(section);
  } else {
    card.appendChild(section);
  }
}

/** Remove unified reviews section from a card. */
export function removeUnifiedReviews(card: HTMLElement): void {
  card.querySelector(`.${SECTION_CLASS}`)?.remove();
}

// ── Sub-sections ─────────────────────────────────────────────────────

function buildSummarySection(summary: ReviewSummary): HTMLElement {
  const el = document.createElement("div");
  el.className = `${SECTION_CLASS}-summary`;

  // Department label
  if (summary.departmentLabel && summary.weightedScore) {
    const dept = document.createElement("div");
    dept.className = `${SECTION_CLASS}-dept`;
    dept.textContent = `🏷️ ${summary.departmentLabel}: ${summary.weightedScore.toFixed(1)}★ weighted`;
    el.appendChild(dept);
  }

  const prosConsRow = document.createElement("div");
  prosConsRow.className = `${SECTION_CLASS}-pros-cons`;

  if (summary.pros.length > 0) {
    const prosEl = document.createElement("div");
    prosEl.className = `${SECTION_CLASS}-pros`;
    const title = document.createElement("div");
    title.className = `${SECTION_CLASS}-sub-title`;
    title.textContent = "👍 Liked";
    prosEl.appendChild(title);
    for (const aspect of summary.pros) {
      prosEl.appendChild(createAspectRow(aspect, true));
    }
    prosConsRow.appendChild(prosEl);
  }

  if (summary.cons.length > 0) {
    const consEl = document.createElement("div");
    consEl.className = `${SECTION_CLASS}-cons`;
    const title = document.createElement("div");
    title.className = `${SECTION_CLASS}-sub-title`;
    title.textContent = "👎 Disliked";
    consEl.appendChild(title);
    for (const aspect of summary.cons) {
      consEl.appendChild(createAspectRow(aspect, false));
    }
    prosConsRow.appendChild(consEl);
  }

  el.appendChild(prosConsRow);
  return el;
}

function createAspectRow(aspect: ReviewAspect, positive: boolean): HTMLElement {
  const row = document.createElement("div");
  row.className = `${SECTION_CLASS}-aspect`;

  const rating = document.createElement("span");
  rating.className = `${SECTION_CLASS}-aspect-rating ${SECTION_CLASS}-aspect-rating--${positive ? "good" : "bad"}`;
  rating.textContent = `${aspect.avgRating.toFixed(1)}★`;

  const label = document.createElement("span");
  label.textContent = aspect.label;

  row.appendChild(rating);
  row.appendChild(label);

  if (aspect.trend) {
    const trend = document.createElement("span");
    trend.className = `${SECTION_CLASS}-aspect-trend`;
    trend.textContent = aspect.trend === "rising" ? "↑" : aspect.trend === "falling" ? "↓" : "";
    if (trend.textContent) row.appendChild(trend);
  }

  return row;
}

function buildInsightsSection(insights: ProductInsights, ignoredCategories: string[]): HTMLElement {
  const el = document.createElement("div");
  el.className = `${SECTION_CLASS}-insights`;

  const title = document.createElement("div");
  title.className = `${SECTION_CLASS}-sub-title`;
  title.textContent = "Topic Breakdown";
  title.style.marginBottom = SPACE[1];
  el.appendChild(title);

  const topics = insights.topicScores
    .filter((ts) => ts.reviewMentions >= 1 && !ignoredCategories.includes(ts.categoryId))
    .sort((a, b) => b.reviewMentions - a.reviewMentions)
    .slice(0, 6);

  for (const topic of topics) {
    el.appendChild(createTopicRow(topic));
  }

  return el;
}

function createTopicRow(topic: TopicScore): HTMLElement {
  const row = document.createElement("div");
  row.className = `${SECTION_CLASS}-topic`;

  const label = document.createElement("span");
  label.className = `${SECTION_CLASS}-topic-label`;
  label.textContent = topic.categoryId.replace(/-/g, " ");

  const bar = document.createElement("span");
  bar.className = `${SECTION_CLASS}-topic-bar`;
  const fill = document.createElement("span");
  fill.className = `${SECTION_CLASS}-topic-bar-fill`;
  fill.style.width = `${(topic.avgRating / 5) * 100}%`;
  fill.style.background = topic.avgRating >= 4 ? COLORS.success
    : topic.avgRating >= 3 ? COLORS.warning
    : COLORS.danger;
  bar.appendChild(fill);

  const score = document.createElement("span");
  score.className = `${SECTION_CLASS}-topic-score`;
  score.textContent = `${topic.avgRating.toFixed(1)}★ (${topic.reviewMentions})`;

  row.appendChild(label);
  row.appendChild(bar);
  row.appendChild(score);
  return row;
}

function buildGallerySection(gallery: ReviewMediaGallery): HTMLElement {
  const el = document.createElement("div");
  el.className = `${SECTION_CLASS}-gallery`;

  const title = document.createElement("div");
  title.className = `${SECTION_CLASS}-sub-title`;
  const imgCount = gallery.items.filter((i) => i.type === "image").length;
  title.textContent = `📷 ${imgCount} Review Photo${imgCount !== 1 ? "s" : ""}`;
  el.appendChild(title);

  const grid = document.createElement("div");
  grid.className = `${SECTION_CLASS}-gallery-grid`;

  const displayItems = gallery.items.slice(0, MAX_GALLERY_THUMBS);
  for (const item of displayItems) {
    grid.appendChild(createGalleryThumb(item));
  }

  if (gallery.items.length > MAX_GALLERY_THUMBS) {
    const more = document.createElement("div");
    more.className = `${SECTION_CLASS}-gallery-more`;
    more.textContent = `+${gallery.items.length - MAX_GALLERY_THUMBS}`;
    grid.appendChild(more);
  }

  el.appendChild(grid);
  return el;
}

function createGalleryThumb(item: ReviewMedia): HTMLElement {
  const thumb = document.createElement("div");
  thumb.className = `${SECTION_CLASS}-gallery-thumb`;

  const img = document.createElement("img");
  img.src = item.thumbnailUrl;
  img.alt = `Review ${item.type}`;
  img.loading = "lazy";
  thumb.appendChild(img);

  if (item.verified) {
    const badge = document.createElement("span");
    badge.className = `${SECTION_CLASS}-gallery-thumb-verified`;
    badge.textContent = "✓";
    thumb.appendChild(badge);
  }

  return thumb;
}
