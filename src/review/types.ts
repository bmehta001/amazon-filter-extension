/** Star rating distribution histogram (percentages, should sum to ~100). */
export interface HistogramData {
  five: number;
  four: number;
  three: number;
  two: number;
  one: number;
}

/** A single parsed review from a product page. */
export interface ReviewData {
  text: string;
  rating: number;
  date: Date;
  verified: boolean;
  helpfulVotes: number;
}

/** Breakdown of deductions from each analysis category. */
export interface ScoreBreakdown {
  histogramDeduction: number;
  textDeduction: number;
  temporalDeduction: number;
  mlDeduction?: number;
  reasons: string[];
}

/** Final review quality score for a product. */
export interface ReviewScore {
  /** Composite score 0-100 (100 = likely authentic). */
  score: number;
  /** Human-readable label. */
  label: "authentic" | "mixed" | "suspicious";
  /** Detailed breakdown of how the score was computed. */
  breakdown: ScoreBreakdown;
  /** Timestamp when this score was computed. */
  computedAt: number;
}

/** Raw data fetched from a product detail page. */
export interface ProductReviewData {
  asin: string;
  histogram: HistogramData | null;
  reviews: ReviewData[];
  totalRatings: number;
  averageRating: number;
}

/** Cache entry for a scored product. */
export interface CachedReviewScore {
  asin: string;
  score: ReviewScore;
  /** Unix timestamp when cached. */
  cachedAt: number;
}
