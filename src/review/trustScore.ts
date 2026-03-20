/**
 * Composite trust score calculator.
 *
 * Combines all individual trust signals into a single 0-100 score with:
 * - Confidence-weighted deductions (weak signals with small samples count less)
 * - 4-tier labeling (Trustworthy / Mixed / Questionable / Suspicious)
 * - Positive signal detection (things that INCREASE trust)
 * - Full transparency: every signal and its reasoning is exposed to the UI
 */
import type {
  ProductReviewData,
  CategorizedReview,
} from "./types";
import {
  type TrustSignal,
  computeAllTrustSignals,
} from "./trustSignals";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrustScoreResult {
  /** Composite trust score 0-100 (100 = highly trustworthy). */
  score: number;
  /** Human-readable label. */
  label: "trustworthy" | "mixed" | "questionable" | "suspicious";
  /** Color class for UI. */
  color: "green" | "yellow" | "orange" | "red";
  /** All detected signals (both positive and negative). */
  signals: TrustSignal[];
  /** Positive trust indicators (human-readable strings). */
  positiveSignals: string[];
  /** Total possible deduction across all signals. */
  maxPossibleDeduction: number;
  /** Actual confidence-weighted deduction applied. */
  totalDeduction: number;
  /** Number of reviews the analysis was based on. */
  sampleSize: number;
  /** Timestamp of computation. */
  computedAt: number;
}

// ---------------------------------------------------------------------------
// Positive signal detection
// ---------------------------------------------------------------------------

/**
 * Detect signals that INCREASE trust in the reviews.
 * These don't add to the score (it starts at 100) but are shown to users
 * to explain why a product is rated as trustworthy.
 */
function detectPositiveSignals(
  data: ProductReviewData,
  categorized: CategorizedReview[],
): string[] {
  const positives: string[] = [];
  const reviews = data.reviews;

  // High verified purchase rate
  if (reviews.length >= 3) {
    const verifiedRatio = reviews.filter((r) => r.verified).length / reviews.length;
    if (verifiedRatio >= 0.8) {
      positives.push(`${(verifiedRatio * 100).toFixed(0)}% of reviews are verified purchases`);
    }
  }

  // Reviews contain product-specific details (varied vocabulary)
  if (reviews.length >= 3) {
    const allWords = new Set<string>();
    for (const r of reviews) {
      for (const w of r.text.toLowerCase().split(/\s+/)) {
        if (w.length > 3) allWords.add(w);
      }
    }
    const avgUniqueWords = allWords.size / reviews.length;
    if (avgUniqueWords > 30) {
      positives.push("Reviews contain diverse, product-specific vocabulary");
    }
  }

  // Good rating distribution (healthy 4★ representation)
  if (data.histogram) {
    const total = data.histogram.five + data.histogram.four + data.histogram.three + data.histogram.two + data.histogram.one;
    if (total > 0) {
      const fourPct = (data.histogram.four / total) * 100;
      if (fourPct >= 12 && fourPct <= 30) {
        positives.push("Healthy rating distribution with natural 4★ representation");
      }
    }
  }

  // Reviews mention both pros and cons
  if (categorized.length >= 3) {
    const withMultipleTopics = categorized.filter((cr) => cr.categories.length >= 2).length;
    if (withMultipleTopics / categorized.length >= 0.3) {
      positives.push("Reviews discuss multiple topics (balanced perspective)");
    }
  }

  // Helpful votes present — real community engagement
  if (reviews.length >= 3) {
    const withVotes = reviews.filter((r) => r.helpfulVotes > 0).length;
    if (withVotes / reviews.length >= 0.3) {
      positives.push("Reviews have community helpful votes — real shopper engagement");
    }
  }

  // Reviews spread over time
  const validDates = reviews.filter((r) => r.date.getTime() > 0);
  if (validDates.length >= 3) {
    const sorted = [...validDates].sort((a, b) => a.date.getTime() - b.date.getTime());
    const spanDays = (sorted[sorted.length - 1].date.getTime() - sorted[0].date.getTime()) / (24 * 60 * 60 * 1000);
    if (spanDays >= 90) {
      positives.push("Reviews spread over several months — organic growth pattern");
    }
  }

  return positives;
}

// ---------------------------------------------------------------------------
// Composite score
// ---------------------------------------------------------------------------

/**
 * Compute the composite trust score for a product.
 *
 * Design: starts at 100 and subtracts confidence-weighted deductions.
 * A signal with 10pt deduction at 0.5 confidence only subtracts 5 points.
 * This ensures weak signals from small samples don't over-penalize.
 */
export function computeTrustScore(
  data: ProductReviewData,
  categorized?: CategorizedReview[],
): TrustScoreResult {
  const signals = computeAllTrustSignals(data, categorized);
  const positiveSignals = detectPositiveSignals(data, categorized ?? []);

  // Sum confidence-weighted deductions
  let totalDeduction = 0;
  let maxPossibleDeduction = 0;

  for (const signal of signals) {
    totalDeduction += signal.deduction * signal.confidence;
    maxPossibleDeduction += signal.maxDeduction;
  }

  // Clamp to 0-100
  const score = Math.max(0, Math.min(100, Math.round(100 - totalDeduction)));

  // 4-tier labeling
  let label: TrustScoreResult["label"];
  let color: TrustScoreResult["color"];

  if (score >= 85) {
    label = "trustworthy";
    color = "green";
  } else if (score >= 65) {
    label = "mixed";
    color = "yellow";
  } else if (score >= 40) {
    label = "questionable";
    color = "orange";
  } else {
    label = "suspicious";
    color = "red";
  }

  return {
    score,
    label,
    color,
    signals,
    positiveSignals,
    maxPossibleDeduction,
    totalDeduction: Math.round(totalDeduction * 10) / 10,
    sampleSize: data.reviews.length,
    computedAt: Date.now(),
  };
}
