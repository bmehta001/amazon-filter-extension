import type {
  HistogramData,
  ProductReviewData,
  ReviewData,
  ReviewScore,
  ScoreBreakdown,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPERLATIVE_PATTERN =
  /\b(best|amazing|perfect|awesome|love|excellent|incredible|wonderful|fantastic|great|outstanding)\b/gi;

const TEMPLATE_PHRASES = [
  "i received",
  "worth the money",
  "highly recommend",
  "5 stars",
  "bought this for",
  "works as expected",
  "does the job",
  "great product",
  "love this",
];

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split text into lowercase words (simple whitespace tokeniser). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Shannon entropy (in bits) over a probability distribution. */
function shannonEntropy(values: number[]): number {
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;

  return values.reduce((entropy, v) => {
    if (v <= 0) return entropy;
    const p = v / total;
    return entropy - p * Math.log2(p);
  }, 0);
}

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// 1. Histogram analysis
// ---------------------------------------------------------------------------

/**
 * Analyse the star-rating histogram for signs of manipulation.
 *
 * Checks for:
 * - J-curve (bimodal polarisation)
 * - Abnormally high 5-star percentage
 * - Low Shannon entropy (lack of rating diversity)
 *
 * @returns deduction (capped at 30) and human-readable reasons.
 */
export function analyzeHistogram(
  histogram: HistogramData,
  totalRatings: number,
): { deduction: number; reasons: string[] } {
  const reasons: string[] = [];
  let deduction = 0;

  const total =
    histogram.five +
    histogram.four +
    histogram.three +
    histogram.two +
    histogram.one;

  if (total === 0) return { deduction: 0, reasons };

  const pct = (v: number) => (v / total) * 100;

  const fivePct = pct(histogram.five);
  const fourPct = pct(histogram.four);
  const threePct = pct(histogram.three);
  const twoPct = pct(histogram.two);
  const onePct = pct(histogram.one);

  // J-curve: polarised reviews cluster at 5★ and 1★
  if (fivePct + onePct > 80 && twoPct + threePct < 10) {
    deduction += 25;
    reasons.push("Bimodal J-curve distribution (polarized reviews)");
  }

  // Suspiciously high 5-star concentration
  if (fivePct > 90 && totalRatings > 50) {
    deduction += 20;
    reasons.push("Suspiciously high 5-star percentage");
  }

  // Shannon entropy of the distribution
  const entropy = shannonEntropy([
    histogram.five,
    histogram.four,
    histogram.three,
    histogram.two,
    histogram.one,
  ]);

  if (entropy < 1.0) {
    deduction += 15;
    reasons.push("Low rating diversity");
  }

  return { deduction: Math.min(deduction, 30), reasons };
}

// ---------------------------------------------------------------------------
// 2. Single-review text analysis
// ---------------------------------------------------------------------------

/**
 * Score a single review's text for signs of inauthenticity.
 *
 * Checks:
 * - Low type-token ratio (repetitive vocabulary)
 * - High superlative density
 * - Presence of common template phrases
 * - Very short 5-star reviews
 *
 * @returns deduction (capped at 40) and human-readable reasons.
 */
export function analyzeReviewText(
  review: ReviewData,
): { deduction: number; reasons: string[] } {
  const reasons: string[] = [];
  let deduction = 0;

  const words = tokenize(review.text);
  const wordCount = words.length;

  // Type-Token Ratio — low ratio signals repetitive / generated text
  if (wordCount > 30) {
    const uniqueWords = new Set(words).size;
    const ttr = uniqueWords / wordCount;
    if (ttr < 0.35) {
      deduction += 10;
      reasons.push("Low type-token ratio (repetitive vocabulary)");
    }
  }

  // Superlative density
  const superlativeMatches = review.text.match(SUPERLATIVE_PATTERN) ?? [];
  if (wordCount > 0 && superlativeMatches.length / wordCount > 0.05) {
    deduction += 10;
    reasons.push("High superlative density");
  }

  // Template phrase detection
  const lowerText = review.text.toLowerCase();
  const templateHits = TEMPLATE_PHRASES.filter((phrase) =>
    lowerText.includes(phrase),
  ).length;

  if (templateHits >= 3) {
    deduction += 15;
    reasons.push("Multiple template phrases detected");
  }

  // Very short 5-star review
  if (wordCount < 20 && review.rating === 5) {
    deduction += 5;
    reasons.push("Very short 5-star review");
  }

  return { deduction: Math.min(deduction, 40), reasons };
}

// ---------------------------------------------------------------------------
// 3. Aggregate text analysis
// ---------------------------------------------------------------------------

/**
 * Analyse all reviews' text and return the average deduction and unique reasons.
 */
export function analyzeReviewTexts(
  reviews: ReviewData[],
): { avgDeduction: number; reasons: string[] } {
  if (reviews.length === 0) return { avgDeduction: 0, reasons: [] };

  let totalDeduction = 0;
  const allReasons = new Set<string>();

  for (const review of reviews) {
    const result = analyzeReviewText(review);
    totalDeduction += result.deduction;
    for (const r of result.reasons) allReasons.add(r);
  }

  return {
    avgDeduction: totalDeduction / reviews.length,
    reasons: Array.from(allReasons),
  };
}

// ---------------------------------------------------------------------------
// 4. Temporal pattern analysis
// ---------------------------------------------------------------------------

/**
 * Detect suspicious temporal patterns in review submission dates.
 *
 * Checks:
 * - Burst activity (≥ 5 reviews within 24 h)
 * - Recovery bursts (negative review followed by ≥ 3 five-star reviews in 48 h)
 * - All reviews posted within a single week
 *
 * @returns deduction (capped at 30) and human-readable reasons.
 */
export function analyzeTemporalPattern(
  reviews: ReviewData[],
): { deduction: number; reasons: string[] } {
  const reasons: string[] = [];
  let deduction = 0;

  if (reviews.length < 2) return { deduction: 0, reasons };

  const sorted = [...reviews].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const timestamps = sorted.map((r) => r.date.getTime());

  // Burst detection — sliding window of 24 h
  for (let i = 0; i <= timestamps.length - 5; i++) {
    if (timestamps[i + 4] - timestamps[i] <= MS_PER_DAY) {
      deduction += 15;
      reasons.push("Burst of 5+ reviews within 24 hours");
      break;
    }
  }

  // Recovery burst — negative review followed by 3+ five-star in 48 h
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].rating <= 2) {
      const windowEnd = sorted[i].date.getTime() + 2 * MS_PER_DAY;
      const followUp = sorted
        .slice(i + 1)
        .filter((r) => r.date.getTime() <= windowEnd && r.rating === 5);

      if (followUp.length >= 3) {
        deduction += 20;
        reasons.push(
          "Recovery burst: negative review followed by 3+ five-star reviews within 48 hours",
        );
        break;
      }
    }
  }

  // All reviews within one week
  const span = timestamps[timestamps.length - 1] - timestamps[0];
  if (span <= 7 * MS_PER_DAY) {
    deduction += 10;
    reasons.push("All reviews posted within a single week");
  }

  return { deduction: Math.min(deduction, 30), reasons };
}

// ---------------------------------------------------------------------------
// 5. Composite score
// ---------------------------------------------------------------------------

/**
 * Compute an overall review-authenticity score for a product.
 *
 * Combines histogram, text, and temporal analyses into a single 0–100 score
 * with a human-readable label.
 */
export function computeReviewScore(data: ProductReviewData): ReviewScore {
  const histogramResult = data.histogram
    ? analyzeHistogram(data.histogram, data.totalRatings)
    : { deduction: 0, reasons: [] as string[] };

  const textResult = analyzeReviewTexts(data.reviews);
  const temporalResult = analyzeTemporalPattern(data.reviews);

  const rawScore =
    100 -
    histogramResult.deduction -
    textResult.avgDeduction -
    temporalResult.deduction;

  const score = clamp(Math.round(rawScore), 0, 100);

  let label: ReviewScore["label"];
  if (score >= 80) label = "authentic";
  else if (score >= 50) label = "mixed";
  else label = "suspicious";

  const breakdown: ScoreBreakdown = {
    histogramDeduction: histogramResult.deduction,
    textDeduction: textResult.avgDeduction,
    temporalDeduction: temporalResult.deduction,
    reasons: [
      ...histogramResult.reasons,
      ...textResult.reasons,
      ...temporalResult.reasons,
    ],
  };

  return { score, label, breakdown, computedAt: Date.now() };
}
