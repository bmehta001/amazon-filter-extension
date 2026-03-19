/**
 * Review summary engine — extracts concise pros/cons from review text.
 * Can use raw keyword matching OR sentence-level TopicScores from categories.ts.
 */

import type { ReviewData, TopicScore } from "./types";
import { REVIEW_CATEGORIES } from "./categories";

/** A summarized aspect mentioned across reviews. */
export interface ReviewAspect {
  /** Short label for the aspect (e.g., "sound quality", "battery life"). */
  label: string;
  /** How many reviews mention this aspect. */
  mentions: number;
  /** Average rating of reviews mentioning this aspect. */
  avgRating: number;
  /** Whether this is positive (≥3.5 avg) or negative (<3.5 avg). */
  sentiment: "positive" | "negative";
  /** Trend indicator if available. */
  trend?: "rising" | "falling" | "stable";
}

/** Generated summary for a product's reviews. */
export interface ReviewSummary {
  /** Top positive aspects (what customers love). */
  pros: ReviewAspect[];
  /** Top negative aspects (what customers complain about). */
  cons: ReviewAspect[];
  /** One-line summary string for card display. */
  oneLiner: string;
}

/**
 * Aspect definitions — common product aspects with keyword patterns.
 * Each aspect has a label and an array of keywords/phrases to match.
 */
const ASPECTS: { label: string; keywords: string[] }[] = [
  { label: "sound quality", keywords: ["sound", "audio", "bass", "treble", "volume", "loud", "noise cancelling", "noise canceling"] },
  { label: "battery life", keywords: ["battery", "charge", "charging", "battery life", "lasts", "hours of use"] },
  { label: "comfort", keywords: ["comfort", "comfortable", "uncomfortable", "fit", "fits", "snug", "tight", "loose", "ear cups", "headband", "ergonomic"] },
  { label: "build quality", keywords: ["build quality", "well made", "well-made", "sturdy", "solid", "durable", "flimsy", "cheap feel", "premium feel", "construction"] },
  { label: "value for money", keywords: ["value", "worth", "price", "affordable", "expensive", "cheap", "bang for buck", "great deal", "overpriced"] },
  { label: "ease of use", keywords: ["easy to use", "easy to set up", "intuitive", "user friendly", "simple", "setup", "plug and play", "complicated", "confusing"] },
  { label: "picture quality", keywords: ["picture", "display", "screen", "resolution", "color", "colours", "bright", "brightness", "vivid", "4k", "hdr"] },
  { label: "delivery", keywords: ["shipping", "delivery", "arrived", "packaging", "packaged", "damaged in shipping", "fast delivery"] },
  { label: "size", keywords: ["size", "compact", "bulky", "portable", "lightweight", "heavy", "small", "large", "thin"] },
  { label: "durability", keywords: ["durable", "lasted", "broke", "broken", "fell apart", "wear", "rust", "stopped working", "long lasting"] },
  { label: "taste", keywords: ["taste", "flavor", "delicious", "bland", "sweet", "salty", "fresh", "stale", "yummy", "gross"] },
  { label: "smell", keywords: ["smell", "scent", "fragrance", "odor", "stink", "fresh"] },
  { label: "connectivity", keywords: ["bluetooth", "wifi", "wireless", "connection", "pairing", "disconnect", "signal", "range", "latency"] },
  { label: "customer service", keywords: ["customer service", "support", "warranty", "refund", "replacement", "responsive", "helpful"] },
  { label: "performance", keywords: ["performance", "fast", "slow", "powerful", "speed", "efficient", "laggy", "responsive"] },
  { label: "appearance", keywords: ["looks", "design", "stylish", "ugly", "beautiful", "sleek", "modern", "color", "aesthetic"] },
  { label: "cleaning", keywords: ["clean", "cleaning", "easy to clean", "dishwasher", "stain", "wash", "wipe"] },
  { label: "safety", keywords: ["safe", "safety", "bpa free", "non-toxic", "child safe", "sharp edges", "hazard"] },
];

/**
 * Generate a review summary from sentence-level TopicScores (preferred).
 * Reuses the deeper analysis from categories.ts instead of re-scanning text.
 */
export function generateSummaryFromTopicScores(topicScores: TopicScore[]): ReviewSummary | null {
  if (topicScores.length === 0) return null;

  const categoryMeta = new Map(REVIEW_CATEGORIES.map((c) => [c.id, c]));

  const allAspects: ReviewAspect[] = topicScores
    .filter((ts) => ts.reviewMentions >= 1)
    .map((ts) => ({
      label: categoryMeta.get(ts.categoryId)?.label ?? ts.categoryId,
      mentions: ts.reviewMentions,
      avgRating: ts.avgRating,
      sentiment: (ts.avgRating >= 3.5 ? "positive" : "negative") as "positive" | "negative",
      trend: ts.trend,
    }));

  if (allAspects.length === 0) return null;

  const pros = allAspects
    .filter((a) => a.sentiment === "positive")
    .sort((a, b) => b.mentions - a.mentions || b.avgRating - a.avgRating)
    .slice(0, 3);

  const cons = allAspects
    .filter((a) => a.sentiment === "negative")
    .sort((a, b) => b.mentions - a.mentions || a.avgRating - b.avgRating)
    .slice(0, 2);

  return { pros, cons, oneLiner: buildOneLiner(pros, cons) };
}

/**
 * Generate a review summary from raw reviews (fallback).
 * Extracts the top 3 pros and top 2 cons using keyword matching.
 */
export function generateReviewSummary(reviews: ReviewData[]): ReviewSummary | null {
  if (reviews.length < 2) return null;

  const aspectScores = new Map<string, { totalRating: number; count: number }>();

  for (const review of reviews) {
    if (!review.text || review.text.length < 10) continue;
    const textLower = review.text.toLowerCase();

    for (const aspect of ASPECTS) {
      const matched = aspect.keywords.some((kw) => textLower.includes(kw));
      if (matched) {
        const existing = aspectScores.get(aspect.label) ?? { totalRating: 0, count: 0 };
        existing.totalRating += review.rating;
        existing.count += 1;
        aspectScores.set(aspect.label, existing);
      }
    }
  }

  // Convert to ReviewAspect and split by sentiment
  const allAspects: ReviewAspect[] = [];
  for (const [label, data] of aspectScores) {
    if (data.count < 1) continue;
    const avgRating = data.totalRating / data.count;
    allAspects.push({
      label,
      mentions: data.count,
      avgRating: Math.round(avgRating * 10) / 10,
      sentiment: avgRating >= 3.5 ? "positive" : "negative",
    });
  }

  if (allAspects.length === 0) return null;

  // Sort by mention count (descending), then by rating extremity
  const pros = allAspects
    .filter((a) => a.sentiment === "positive")
    .sort((a, b) => b.mentions - a.mentions || b.avgRating - a.avgRating)
    .slice(0, 3);

  const cons = allAspects
    .filter((a) => a.sentiment === "negative")
    .sort((a, b) => b.mentions - a.mentions || a.avgRating - b.avgRating)
    .slice(0, 2);

  return {
    pros,
    cons,
    oneLiner: buildOneLiner(pros, cons),
  };
}

/** Build a compact one-line summary for display on a card. */
function buildOneLiner(pros: ReviewAspect[], cons: ReviewAspect[]): string {
  const parts: string[] = [];

  if (pros.length > 0) {
    const proLabels = pros.map((p) => {
      const trendIcon = p.trend === "rising" ? "↑" : p.trend === "falling" ? "↓" : "";
      return p.label + trendIcon;
    }).join(", ");
    parts.push(`👍 ${proLabels}`);
  }

  if (cons.length > 0) {
    const conLabels = cons.map((c) => {
      const trendIcon = c.trend === "rising" ? "↑" : c.trend === "falling" ? "↓" : "";
      return c.label + trendIcon;
    }).join(", ");
    parts.push(`👎 ${conLabels}`);
  }

  if (parts.length === 0) return "";
  return parts.join("  ·  ");
}
