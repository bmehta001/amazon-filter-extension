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
  /** Customer review media (images/videos). */
  mediaGallery?: ReviewMediaGallery;
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
  /** Sentence-level breakdown with per-sentence topics and weights. */
  sentences: CategorizedSentence[];
  /** Detected implied rating from "would have said X stars except..." patterns. */
  impliedRating: number | null;
}

/** A single sentence tagged with its topic(s). */
export interface CategorizedSentence {
  text: string;
  /** Category IDs that matched this sentence. */
  categories: string[];
  /** Weight of this sentence within the review (1/totalSentences). */
  weight: number;
}

/** Per-topic score aggregated from sentence-level data across reviews. */
export interface TopicScore {
  categoryId: string;
  /** Weighted average rating for this topic. */
  avgRating: number;
  /** Number of sentences mentioning this topic. */
  sentenceMentions: number;
  /** Number of reviews containing at least one sentence on this topic. */
  reviewMentions: number;
  /** Sentiment label derived from avgRating. */
  sentiment: "positive" | "mixed" | "negative";
  /** Trend indicator compared to earlier reviews. */
  trend?: "rising" | "falling" | "stable";
}

/** Temporal snapshot of topic sentiment for a time window. */
export interface TopicTrendWindow {
  /** Start of time window. */
  windowStart: Date;
  /** End of time window. */
  windowEnd: Date;
  /** Per-topic average rating in this window. */
  scores: Map<string, number>;
  /** Total reviews in this window. */
  reviewCount: number;
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
  /** Per-topic scores derived from sentence-level analysis. */
  topicScores: TopicScore[];
  /** Temporal trend windows (if enough dated reviews). */
  trendWindows: TopicTrendWindow[];
}

/** Cache entry for product insights. */
export interface CachedProductInsights {
  asin: string;
  insights: ProductInsights;
  cachedAt: number;
}

// ---------------------------------------------------------------------------
// Review media (photos / videos from customer reviews)
// ---------------------------------------------------------------------------

/** A single image or video attachment from a customer review. */
export interface ReviewMedia {
  /** Full-size URL. */
  url: string;
  /** Thumbnail URL (may be same as url for images). */
  thumbnailUrl: string;
  /** Media type. */
  type: "image" | "video";
  /** Star rating of the review containing this media. */
  reviewRating: number;
  /** Whether the review is a verified purchase. */
  verified: boolean;
}

/** Aggregated media gallery for a product. */
export interface ReviewMediaGallery {
  /** All media items extracted from reviews, most-helpful first. */
  items: ReviewMedia[];
  /** Total number of reviews that contained media. */
  reviewsWithMedia: number;
}
