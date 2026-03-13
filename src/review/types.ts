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

/** Result of categorizing a single review. */
export interface CategorizedReview {
  review: ReviewData;
  /** Category IDs that matched this review. */
  categories: string[];
  /** The category with the strongest keyword match, or null. */
  primaryCategory: string | null;
}

/** Summary of one category across all reviews. */
export interface CategorySummary {
  categoryId: string;
  count: number;
  percentage: number;
  avgRating: number;
  /** First ~80 chars of a representative matching review. */
  sampleSnippet: string;
}

/** Full categorization + adjusted rating result for a product. */
export interface ProductInsights {
  categorySummaries: CategorySummary[];
  categorizedReviews: CategorizedReview[];
  /** Rating recalculated excluding reviews in ignored categories. */
  adjustedRating: number;
  /** Review count after excluding ignored categories. */
  adjustedReviewCount: number;
}

/** Cache entry for product insights. */
export interface CachedProductInsights {
  asin: string;
  insights: ProductInsights;
  cachedAt: number;
}
