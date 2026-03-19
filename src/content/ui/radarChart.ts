/**
 * SVG Radar Chart — renders a small radar/spider chart from per-topic scores.
 * Pure DOM (no canvas), lightweight, inline on product cards.
 */

import type { TopicScore } from "../../review/types";
import { REVIEW_CATEGORIES } from "../../review/categories";

const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_SIZE = 140;
const CENTER = CHART_SIZE / 2;
const RADIUS = 52;
const LABEL_OFFSET = 14;

export const RADAR_CHART_STYLES = `
.bas-radar-container {
  display: inline-block;
  vertical-align: top;
  margin: 4px 0;
}

.bas-radar-container svg {
  display: block;
}

.bas-radar-label {
  font-size: 8px;
  fill: #555;
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
}

.bas-radar-label-positive { fill: #28a745; }
.bas-radar-label-negative { fill: #dc3545; }
.bas-radar-label-mixed { fill: #856404; }
`;

function polarToXY(angleDeg: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)];
}

function createSVGElement(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag);
}

/**
 * Build an SVG radar chart for the given topic scores.
 * Shows up to 6 topics arranged radially. Each axis ranges 0–5 (star rating).
 */
export function buildRadarChart(topicScores: TopicScore[]): HTMLElement {
  const topics = topicScores.slice(0, 6);
  if (topics.length < 3) {
    // Not enough axes for a meaningful chart — return a simple text fallback
    return buildFallbackDisplay(topics);
  }

  const n = topics.length;
  const angleStep = 360 / n;
  const categoryMeta = new Map(REVIEW_CATEGORIES.map((c) => [c.id, c]));

  const container = document.createElement("div");
  container.className = "bas-radar-container";

  const svg = createSVGElement("svg") as SVGSVGElement;
  svg.setAttribute("width", String(CHART_SIZE));
  svg.setAttribute("height", String(CHART_SIZE));
  svg.setAttribute("viewBox", `0 0 ${CHART_SIZE} ${CHART_SIZE}`);

  // Draw concentric grid rings (1–5 scale, rings at 1, 2, 3, 4, 5)
  for (let ring = 1; ring <= 5; ring++) {
    const r = (ring / 5) * RADIUS;
    const points: string[] = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = polarToXY(i * angleStep, r);
      points.push(`${x},${y}`);
    }
    const polygon = createSVGElement("polygon");
    polygon.setAttribute("points", points.join(" "));
    polygon.setAttribute("fill", "none");
    polygon.setAttribute("stroke", ring === 3 ? "#ccc" : "#e8e8e8");
    polygon.setAttribute("stroke-width", ring === 3 ? "0.8" : "0.4");
    svg.appendChild(polygon);
  }

  // Draw axis lines
  for (let i = 0; i < n; i++) {
    const [x, y] = polarToXY(i * angleStep, RADIUS);
    const line = createSVGElement("line");
    line.setAttribute("x1", String(CENTER));
    line.setAttribute("y1", String(CENTER));
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", "#ddd");
    line.setAttribute("stroke-width", "0.5");
    svg.appendChild(line);
  }

  // Draw data polygon
  const dataPoints: string[] = [];
  for (let i = 0; i < n; i++) {
    const score = Math.max(0, Math.min(5, topics[i].avgRating));
    const r = (score / 5) * RADIUS;
    const [x, y] = polarToXY(i * angleStep, r);
    dataPoints.push(`${x},${y}`);
  }

  const dataPolygon = createSVGElement("polygon");
  dataPolygon.setAttribute("points", dataPoints.join(" "));
  dataPolygon.setAttribute("fill", "rgba(0, 102, 192, 0.15)");
  dataPolygon.setAttribute("stroke", "#0066c0");
  dataPolygon.setAttribute("stroke-width", "1.5");
  svg.appendChild(dataPolygon);

  // Draw data points (dots)
  for (let i = 0; i < n; i++) {
    const score = Math.max(0, Math.min(5, topics[i].avgRating));
    const r = (score / 5) * RADIUS;
    const [x, y] = polarToXY(i * angleStep, r);

    const dot = createSVGElement("circle");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("r", "3");
    dot.setAttribute("fill", getScoreColor(score));
    dot.setAttribute("stroke", "#fff");
    dot.setAttribute("stroke-width", "1");
    svg.appendChild(dot);
  }

  // Draw labels
  for (let i = 0; i < n; i++) {
    const [lx, ly] = polarToXY(i * angleStep, RADIUS + LABEL_OFFSET);
    const meta = categoryMeta.get(topics[i].categoryId);
    const shortLabel = meta?.label ?? topics[i].categoryId;
    const trendIcon = topics[i].trend === "rising" ? "↑" : topics[i].trend === "falling" ? "↓" : "";

    const text = createSVGElement("text");
    text.setAttribute("x", String(lx));
    text.setAttribute("y", String(ly));
    text.classList.add("bas-radar-label");
    text.classList.add(`bas-radar-label-${topics[i].sentiment}`);
    text.textContent = truncateLabel(shortLabel, 12) + trendIcon;

    // Tooltip on hover
    const title = createSVGElement("title");
    title.textContent = `${shortLabel}: ${topics[i].avgRating}★ (${topics[i].reviewMentions} reviews)${trendIcon ? ` ${topics[i].trend}` : ""}`;
    text.appendChild(title);

    svg.appendChild(text);
  }

  container.appendChild(svg);
  return container;
}

function getScoreColor(score: number): string {
  if (score >= 4.0) return "#28a745";
  if (score >= 3.0) return "#ffc107";
  return "#dc3545";
}

function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + "…";
}

/** Fallback for <3 topics — simple inline text instead of chart. */
function buildFallbackDisplay(topics: TopicScore[]): HTMLElement {
  const container = document.createElement("div");
  container.className = "bas-radar-container";
  container.style.fontSize = "11px";
  container.style.color = "#555";

  const categoryMeta = new Map(REVIEW_CATEGORIES.map((c) => [c.id, c]));

  for (const topic of topics) {
    const meta = categoryMeta.get(topic.categoryId);
    const row = document.createElement("div");
    const sentimentIcon = topic.sentiment === "positive" ? "👍" : topic.sentiment === "negative" ? "👎" : "➖";
    const trendIcon = topic.trend === "rising" ? "↑" : topic.trend === "falling" ? "↓" : "";
    row.textContent = `${sentimentIcon} ${meta?.label ?? topic.categoryId}: ${topic.avgRating}★ ${trendIcon}`;
    container.appendChild(row);
  }

  return container;
}
