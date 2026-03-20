/**
 * Trust signal detectors for fake review identification.
 *
 * Each function analyses a specific dimension of review authenticity and returns
 * a TrustSignal with a deduction, confidence level, and human-readable explanation.
 *
 * Design principle: no single signal should condemn a genuinely great product.
 * A product with 80% 5★ reviews gets a small deduction from rating concentration,
 * but if the reviews are specific, verified, and spread over time, the other signals
 * will be positive — keeping the composite score high.
 */
import type {
  HistogramData,
  ProductReviewData,
  ReviewData,
  CategorizedReview,
} from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrustSignal {
  /** Unique signal identifier. */
  id: string;
  /** Human-readable signal name. */
  name: string;
  /** Points deducted (0 = no issue found). */
  deduction: number;
  /** Maximum possible deduction for this signal. */
  maxDeduction: number;
  /**
   * Confidence in this signal's accuracy (0–1).
   * Lower when sample size is small — scales the effective deduction.
   */
  confidence: number;
  /** Human-readable explanation shown to the user. */
  reason: string;
  /** Severity tier for UI display. */
  severity: "none" | "low" | "medium" | "high";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severity(deduction: number, max: number): TrustSignal["severity"] {
  if (deduction === 0) return "none";
  const ratio = deduction / max;
  if (ratio >= 0.7) return "high";
  if (ratio >= 0.4) return "medium";
  return "low";
}

function noSignal(id: string, name: string, max: number): TrustSignal {
  return { id, name, deduction: 0, maxDeduction: max, confidence: 1, reason: "", severity: "none" };
}

/** Jaccard similarity between two token sets. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const tok of a) if (b.has(tok)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
}

// ---------------------------------------------------------------------------
// Signal 1: Rating Distribution Shape
// ---------------------------------------------------------------------------

/**
 * Analyses the star histogram for manipulation patterns.
 *
 * Key insight for distinguishing genuine vs fake:
 * - Genuine great products: high 5★ BUT with healthy 4★ representation (>10%)
 * - Fake campaigns: high 5★ with almost no 4★ (fakers don't write 4★ reviews)
 *
 * We check the 5★-to-4★ ratio, not just the 5★ percentage alone.
 */
export function analyzeRatingShape(
  histogram: HistogramData | null,
  totalRatings: number,
): TrustSignal {
  const ID = "rating-shape";
  const NAME = "Rating distribution";
  const MAX = 15;

  if (!histogram || totalRatings < 10) return noSignal(ID, NAME, MAX);

  const total = histogram.five + histogram.four + histogram.three + histogram.two + histogram.one;
  if (total === 0) return noSignal(ID, NAME, MAX);

  const pct = (v: number) => (v / total) * 100;
  const fivePct = pct(histogram.five);
  const fourPct = pct(histogram.four);

  let deduction = 0;
  const reasons: string[] = [];

  // The critical signal: 5★-to-4★ gap
  // Genuine products: 4★ is typically 12-25% when 5★ is 60-80%
  // Fake campaigns: 4★ is <5% because fakers write only 5★
  if (fivePct > 70 && fourPct < 5 && totalRatings > 30) {
    deduction += 12;
    reasons.push(`${fivePct.toFixed(0)}% are 5★ but only ${fourPct.toFixed(0)}% are 4★ — genuine products typically have 12-25% 4★`);
  } else if (fivePct > 85 && totalRatings > 50) {
    deduction += 8;
    reasons.push(`${fivePct.toFixed(0)}% of ratings are 5★ — unusually concentrated`);
  }

  // Bimodal: lots of 5★ AND 1★ with nothing in between (competing fake campaigns)
  const onePct = pct(histogram.one);
  const middlePct = pct(histogram.two) + pct(histogram.three) + pct(histogram.four);
  if (fivePct > 50 && onePct > 20 && middlePct < 15) {
    deduction += 10;
    reasons.push("Polarized ratings: many 5★ and 1★ with little in between — possible competing campaigns");
  }

  deduction = Math.min(deduction, MAX);
  const confidence = totalRatings >= 100 ? 1 : totalRatings >= 30 ? 0.7 : 0.4;
  const reason = reasons.join(". ");

  return { id: ID, name: NAME, deduction, maxDeduction: MAX, confidence, reason, severity: severity(deduction, MAX) };
}

// ---------------------------------------------------------------------------
// Signal 2: Verified Purchase Ratio
// ---------------------------------------------------------------------------

/**
 * Check what proportion of sampled reviews are verified purchases.
 * Low verified rates are a strong signal — fake reviews often aren't verified,
 * or use disposable accounts with minimal order history.
 */
export function analyzeVerifiedRatio(reviews: ReviewData[]): TrustSignal {
  const ID = "verified-ratio";
  const NAME = "Verified purchase rate";
  const MAX = 15;

  if (reviews.length < 3) return noSignal(ID, NAME, MAX);

  const verifiedCount = reviews.filter((r) => r.verified).length;
  const ratio = verifiedCount / reviews.length;

  let deduction = 0;
  let reason = "";

  if (ratio < 0.2) {
    deduction = 15;
    reason = `Only ${(ratio * 100).toFixed(0)}% of sampled reviews are verified purchases — very low`;
  } else if (ratio < 0.4) {
    deduction = 10;
    reason = `Only ${(ratio * 100).toFixed(0)}% of sampled reviews are verified purchases — below average`;
  } else if (ratio < 0.6) {
    deduction = 5;
    reason = `${(ratio * 100).toFixed(0)}% verified purchase rate — slightly below typical`;
  }

  // Higher confidence with more reviews sampled
  const confidence = reviews.length >= 8 ? 1 : reviews.length >= 5 ? 0.7 : 0.5;

  return { id: ID, name: NAME, deduction, maxDeduction: MAX, confidence, reason, severity: severity(deduction, MAX) };
}

// ---------------------------------------------------------------------------
// Signal 3: Incentivized Review Language
// ---------------------------------------------------------------------------

const INCENTIVIZED_PHRASES = [
  "received this product free",
  "received free",
  "in exchange for",
  "honest review",
  "provided by the seller",
  "provided by the manufacturer",
  "complimentary",
  "sample product",
  "free sample",
  "promotional item",
  "discount in exchange",
  "received at a discount",
  "vine voice",
  "vine review",
];

/**
 * Detect language indicating the review was incentivized.
 * Amazon Vine reviews are legitimate but should still be flagged as non-organic.
 */
export function detectIncentivizedLanguage(reviews: ReviewData[]): TrustSignal {
  const ID = "incentivized";
  const NAME = "Incentivized reviews";
  const MAX = 12;

  if (reviews.length === 0) return noSignal(ID, NAME, MAX);

  let incentivizedCount = 0;
  const matchedPhrases = new Set<string>();

  for (const review of reviews) {
    const lower = review.text.toLowerCase();
    for (const phrase of INCENTIVIZED_PHRASES) {
      if (lower.includes(phrase)) {
        incentivizedCount++;
        matchedPhrases.add(phrase);
        break; // count each review once
      }
    }
  }

  if (incentivizedCount === 0) return noSignal(ID, NAME, MAX);

  const ratio = incentivizedCount / reviews.length;
  let deduction: number;

  if (ratio >= 0.5) {
    deduction = 12;
  } else if (ratio >= 0.3) {
    deduction = 8;
  } else {
    deduction = 4;
  }

  const reason = `${incentivizedCount} of ${reviews.length} reviews contain incentivized language ("${[...matchedPhrases].slice(0, 2).join('", "')}")`;
  const confidence = reviews.length >= 5 ? 0.9 : 0.6;

  return { id: ID, name: NAME, deduction, maxDeduction: MAX, confidence, reason, severity: severity(deduction, MAX) };
}

// ---------------------------------------------------------------------------
// Signal 4: Generic Praise Detection
// ---------------------------------------------------------------------------

const GENERIC_PRAISE_PHRASES = [
  "great product",
  "love it",
  "love this",
  "highly recommend",
  "best ever",
  "works great",
  "works perfectly",
  "exactly what i needed",
  "exactly as described",
  "five stars",
  "5 stars",
  "amazing product",
  "perfect product",
  "would buy again",
  "must buy",
  "so happy",
  "very happy",
  "no complaints",
  "exceeded expectations",
  "a+++",
  "a++++",
];

/**
 * Detect reviews that are mostly generic praise without product-specific details.
 *
 * Key distinguisher: genuine enthusiastic reviews mention SPECIFIC features
 * ("the noise cancellation blocks out airplane noise"), while fake reviews
 * use generic templates ("great product, highly recommend, 5 stars").
 *
 * We measure the ratio of generic-praise words to total content.
 */
export function detectGenericPraise(reviews: ReviewData[]): TrustSignal {
  const ID = "generic-praise";
  const NAME = "Review specificity";
  const MAX = 12;

  if (reviews.length === 0) return noSignal(ID, NAME, MAX);

  let genericCount = 0;

  for (const review of reviews) {
    if (review.rating < 4) continue; // only check positive reviews for generic praise

    const lower = review.text.toLowerCase();
    const words = tokenize(review.text);
    const phraseHits = GENERIC_PRAISE_PHRASES.filter((p) => lower.includes(p)).length;

    // A review is "generic" if it has ≥2 template phrases AND is short (<40 words)
    // OR has ≥3 template phrases regardless of length
    if ((phraseHits >= 2 && words.length < 40) || phraseHits >= 3) {
      genericCount++;
    }
  }

  const positiveReviews = reviews.filter((r) => r.rating >= 4).length;
  if (positiveReviews === 0) return noSignal(ID, NAME, MAX);

  const ratio = genericCount / positiveReviews;

  if (ratio < 0.2) return noSignal(ID, NAME, MAX);

  let deduction: number;
  if (ratio >= 0.6) {
    deduction = 12;
  } else if (ratio >= 0.4) {
    deduction = 8;
  } else {
    deduction = 4;
  }

  const reason = `${genericCount} of ${positiveReviews} positive reviews use generic praise without product-specific details`;
  const confidence = reviews.length >= 5 ? 0.8 : 0.5;

  return { id: ID, name: NAME, deduction, maxDeduction: MAX, confidence, reason, severity: severity(deduction, MAX) };
}

// ---------------------------------------------------------------------------
// Signal 5: Review Length Uniformity
// ---------------------------------------------------------------------------

/**
 * Check if review lengths are suspiciously uniform (template-generated).
 * Real reviews have varied lengths — from one-liners to paragraphs.
 * Template campaigns produce reviews of similar length.
 */
export function analyzeReviewLengthDistribution(reviews: ReviewData[]): TrustSignal {
  const ID = "length-uniformity";
  const NAME = "Review length variety";
  const MAX = 8;

  if (reviews.length < 4) return noSignal(ID, NAME, MAX);

  const lengths = reviews.map((r) => r.text.length);
  const mean = lengths.reduce((s, l) => s + l, 0) / lengths.length;

  if (mean === 0) return noSignal(ID, NAME, MAX);

  const variance = lengths.reduce((s, l) => s + (l - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation — how spread out are review lengths relative to mean?
  const cv = stdDev / mean;

  // Real reviews typically have CV > 0.5 (wide variety of lengths)
  // Template reviews often have CV < 0.25
  if (cv > 0.3) return noSignal(ID, NAME, MAX);

  let deduction: number;
  if (cv < 0.15) {
    deduction = 8;
  } else {
    deduction = 4;
  }

  const reason = `Review lengths are unusually uniform (std dev: ${stdDev.toFixed(0)} chars, mean: ${mean.toFixed(0)} chars) — may indicate template-based reviews`;
  const confidence = reviews.length >= 7 ? 0.8 : 0.5;

  return { id: ID, name: NAME, deduction, maxDeduction: MAX, confidence, reason, severity: severity(deduction, MAX) };
}

// ---------------------------------------------------------------------------
// Signal 6: Copy-Paste / Duplicate Review Detection
// ---------------------------------------------------------------------------

/**
 * Detect near-duplicate reviews using Jaccard token similarity.
 * Fake review campaigns often reuse the same text with minor variations.
 */
export function detectCopyPasteReviews(reviews: ReviewData[]): TrustSignal {
  const ID = "copy-paste";
  const NAME = "Duplicate review content";
  const MAX = 15;

  if (reviews.length < 2) return noSignal(ID, NAME, MAX);

  const tokenSets = reviews.map((r) => new Set(tokenize(r.text)));
  let duplicatePairs = 0;
  let totalPairs = 0;

  for (let i = 0; i < tokenSets.length; i++) {
    // Skip very short reviews — they naturally overlap
    if (tokenSets[i].size < 5) continue;

    for (let j = i + 1; j < tokenSets.length; j++) {
      if (tokenSets[j].size < 5) continue;
      totalPairs++;
      const sim = jaccard(tokenSets[i], tokenSets[j]);
      if (sim >= 0.7) duplicatePairs++;
    }
  }

  if (duplicatePairs === 0) return noSignal(ID, NAME, MAX);

  let deduction: number;
  if (duplicatePairs >= 3) {
    deduction = 15;
  } else if (duplicatePairs >= 2) {
    deduction = 10;
  } else {
    deduction = 7;
  }

  const reason = `${duplicatePairs} pair(s) of reviews share >70% of the same words — possible copy-paste or template`;
  const confidence = totalPairs >= 5 ? 0.9 : 0.6;

  return { id: ID, name: NAME, deduction, maxDeduction: MAX, confidence, reason, severity: severity(deduction, MAX) };
}

// ---------------------------------------------------------------------------
// Signal 7: Sentiment-Rating Mismatch (uses sentence-level analysis)
// ---------------------------------------------------------------------------

/**
 * Detect reviews where the star rating contradicts the text sentiment.
 *
 * Uses our sentence-level categorization: if a 5★ review's sentences
 * map predominantly to negative-sentiment topics, or a 1★ review is
 * predominantly positive, the review may be inauthentic.
 *
 * This is the signal that benefits most from our sentence-level engine.
 */
export function detectSentimentMismatch(
  reviews: ReviewData[],
  categorized: CategorizedReview[],
): TrustSignal {
  const ID = "sentiment-mismatch";
  const NAME = "Rating-text consistency";
  const MAX = 10;

  if (categorized.length === 0) return noSignal(ID, NAME, MAX);

  // Negative sentiment keywords (used to gauge text tone)
  const NEGATIVE = /\b(terrible|awful|horrible|worst|broke|broken|defective|waste|useless|garbage|trash|hate|disappointing|regret|return|refund)\b/i;
  const POSITIVE = /\b(excellent|amazing|perfect|love|great|fantastic|wonderful|outstanding|superb|impressed|best)\b/i;

  let mismatchCount = 0;

  for (const cr of categorized) {
    const text = cr.review.text;
    const rating = cr.review.rating;

    const hasNegative = NEGATIVE.test(text);
    const hasPositive = POSITIVE.test(text);

    // 5★ review with clearly negative language and no positive language
    if (rating === 5 && hasNegative && !hasPositive) {
      mismatchCount++;
    }
    // 1★ review with clearly positive language and no negative language
    if (rating <= 2 && hasPositive && !hasNegative) {
      mismatchCount++;
    }
  }

  if (mismatchCount === 0) return noSignal(ID, NAME, MAX);

  const ratio = mismatchCount / categorized.length;
  let deduction: number;
  if (ratio >= 0.4) {
    deduction = 10;
  } else if (ratio >= 0.2) {
    deduction = 6;
  } else {
    deduction = 3;
  }

  const reason = `${mismatchCount} of ${categorized.length} reviews have star ratings that contradict their text sentiment`;
  const confidence = categorized.length >= 5 ? 0.8 : 0.5;

  return { id: ID, name: NAME, deduction, maxDeduction: MAX, confidence, reason, severity: severity(deduction, MAX) };
}

// ---------------------------------------------------------------------------
// Signal 8: Helpful Vote Distribution
// ---------------------------------------------------------------------------

/**
 * On a product with many ratings, if no sampled review has any helpful votes,
 * it suggests the reviews aren't being read by real shoppers — possible fakes.
 *
 * Low-weight signal: some categories just don't get helpful votes.
 */
export function analyzeHelpfulVotes(
  reviews: ReviewData[],
  totalRatings: number,
): TrustSignal {
  const ID = "helpful-votes";
  const NAME = "Helpful vote engagement";
  const MAX = 6;

  if (reviews.length < 3 || totalRatings < 50) return noSignal(ID, NAME, MAX);

  const withVotes = reviews.filter((r) => r.helpfulVotes > 0).length;

  // If a product has hundreds of ratings but zero helpful votes on any review,
  // the reviews may not be resonating with real shoppers
  if (withVotes === 0 && totalRatings >= 200) {
    return {
      id: ID, name: NAME, deduction: 6, maxDeduction: MAX, confidence: 0.5,
      reason: `None of ${reviews.length} sampled reviews have any helpful votes despite ${totalRatings} total ratings`,
      severity: "low",
    };
  }

  if (withVotes === 0 && totalRatings >= 50) {
    return {
      id: ID, name: NAME, deduction: 3, maxDeduction: MAX, confidence: 0.4,
      reason: "No sampled reviews have helpful votes",
      severity: "low",
    };
  }

  return noSignal(ID, NAME, MAX);
}

// ---------------------------------------------------------------------------
// Signal 9: Date Clustering
// ---------------------------------------------------------------------------

/**
 * Detect if reviews are abnormally clustered in time.
 * Fake review campaigns are often executed in bursts.
 *
 * Distinct from the existing temporal analysis: this focuses on the
 * percentage of reviews within the densest time window, not specific
 * patterns like "recovery bursts."
 */
export function detectDateClustering(reviews: ReviewData[]): TrustSignal {
  const ID = "date-clustering";
  const NAME = "Review date spread";
  const MAX = 12;

  if (reviews.length < 3) return noSignal(ID, NAME, MAX);

  const validReviews = reviews.filter((r) => r.date.getTime() > 0);
  if (validReviews.length < 3) return noSignal(ID, NAME, MAX);

  const sorted = [...validReviews].sort((a, b) => a.date.getTime() - b.date.getTime());
  const timestamps = sorted.map((r) => r.date.getTime());

  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  // Sliding 7-day window: find the window with the most reviews
  let maxInWindow = 0;
  for (let i = 0; i < timestamps.length; i++) {
    const windowEnd = timestamps[i] + SEVEN_DAYS;
    let count = 0;
    for (let j = i; j < timestamps.length && timestamps[j] <= windowEnd; j++) {
      count++;
    }
    if (count > maxInWindow) maxInWindow = count;
  }

  const clusterRatio = maxInWindow / validReviews.length;

  if (clusterRatio < 0.5) return noSignal(ID, NAME, MAX);

  let deduction: number;
  if (clusterRatio >= 0.8) {
    deduction = 12;
  } else if (clusterRatio >= 0.6) {
    deduction = 7;
  } else {
    deduction = 4;
  }

  const reason = `${(clusterRatio * 100).toFixed(0)}% of reviews were posted within the same 7-day window — possible review campaign`;
  const confidence = validReviews.length >= 7 ? 0.85 : 0.5;

  return { id: ID, name: NAME, deduction, maxDeduction: MAX, confidence, reason, severity: severity(deduction, MAX) };
}

// ---------------------------------------------------------------------------
// Signal 10: Review-to-Rating Count Anomaly
// ---------------------------------------------------------------------------

/**
 * Check if the total rating count seems inflated relative to actual review content.
 * A product with 5000 ratings but where every sampled review is short and generic
 * is more suspicious than one with 5000 ratings and detailed, varied reviews.
 *
 * This is a meta-signal: it amplifies other signals when rating count is high.
 */
export function analyzeRatingCountAnomaly(
  reviews: ReviewData[],
  totalRatings: number,
  averageRating: number,
  histogram: HistogramData | null,
): TrustSignal {
  const ID = "rating-count-anomaly";
  const NAME = "Rating volume credibility";
  const MAX = 8;

  if (!histogram || totalRatings < 50) return noSignal(ID, NAME, MAX);

  // Verify displayed average matches histogram
  const total = histogram.five + histogram.four + histogram.three + histogram.two + histogram.one;
  if (total === 0) return noSignal(ID, NAME, MAX);

  const computedAvg = (
    histogram.five * 5 + histogram.four * 4 + histogram.three * 3 +
    histogram.two * 2 + histogram.one * 1
  ) / total;

  const avgDiff = Math.abs(computedAvg - averageRating);

  // If the displayed average differs significantly from what the histogram implies,
  // the histogram may have been manipulated or the data is inconsistent
  if (avgDiff > 0.3) {
    return {
      id: ID, name: NAME, deduction: 8, maxDeduction: MAX, confidence: 0.7,
      reason: `Displayed average (${averageRating.toFixed(1)}★) differs from histogram-computed average (${computedAvg.toFixed(1)}★) by ${avgDiff.toFixed(1)} points`,
      severity: "medium",
    };
  }

  return noSignal(ID, NAME, MAX);
}

// ---------------------------------------------------------------------------
// Composite: run all signals
// ---------------------------------------------------------------------------

/**
 * Run all trust signal detectors and return the full array.
 */
export function computeAllTrustSignals(
  data: ProductReviewData,
  categorized?: CategorizedReview[],
): TrustSignal[] {
  const signals: TrustSignal[] = [];

  signals.push(analyzeRatingShape(data.histogram, data.totalRatings));
  signals.push(analyzeVerifiedRatio(data.reviews));
  signals.push(detectIncentivizedLanguage(data.reviews));
  signals.push(detectGenericPraise(data.reviews));
  signals.push(analyzeReviewLengthDistribution(data.reviews));
  signals.push(detectCopyPasteReviews(data.reviews));
  signals.push(detectSentimentMismatch(data.reviews, categorized ?? []));
  signals.push(analyzeHelpfulVotes(data.reviews, data.totalRatings));
  signals.push(detectDateClustering(data.reviews));
  signals.push(analyzeRatingCountAnomaly(data.reviews, data.totalRatings, data.averageRating, data.histogram));

  return signals;
}
