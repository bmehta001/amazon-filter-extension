import type {
  ReviewData, CategorizedReview, CategorizedSentence,
  CategorySummary, ProductInsights, TopicScore, TopicTrendWindow,
} from "./types";

/** Category definition type. */
export interface ReviewCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  keywords: string[];
  isProductRelated: boolean;
}

/** All available review categories. */
export const REVIEW_CATEGORIES: ReviewCategory[] = [
  {
    id: "product-quality",
    label: "Product Quality",
    icon: "📦",
    description: "Reviews about the overall build quality and craftsmanship of the product",
    keywords: [
      "quality", "well made", "poorly made", "build quality", "craftsmanship",
      "construction", "material", "materials", "flimsy", "sturdy", "solid",
      "cheap feel", "premium", "well-built", "defective", "broken",
      "stopped working", "doesn't work", "malfunction", "faulty",
    ],
    isProductRelated: true,
  },
  {
    id: "performance",
    label: "Performance",
    icon: "⚡",
    description: "Reviews about how well the product performs its intended function",
    keywords: [
      "performance", "fast", "slow", "powerful", "weak", "efficient",
      "battery life", "battery", "speed", "responsive", "laggy", "lag",
      "latency", "output", "loud", "quiet", "noise", "sound quality",
      "picture quality", "resolution", "brightness",
    ],
    isProductRelated: true,
  },
  {
    id: "durability",
    label: "Durability",
    icon: "🔨",
    description: "Reviews about how long the product lasts over time",
    keywords: [
      "durable", "durability", "lasted", "broke after", "fell apart", "wear",
      "worn", "rust", "rusted", "longevity", "long lasting", "months later",
      "year later", "still works", "stopped working after",
    ],
    isProductRelated: true,
  },
  {
    id: "ease-of-use",
    label: "Ease of Use",
    icon: "🎯",
    description: "Reviews about how easy or difficult the product is to use and set up",
    keywords: [
      "easy to use", "user friendly", "intuitive", "complicated", "confusing",
      "learning curve", "setup", "set up", "install", "installation",
      "instructions", "manual", "plug and play", "out of the box",
      "difficult to", "hard to",
    ],
    isProductRelated: true,
  },
  {
    id: "value",
    label: "Value for Money",
    icon: "💰",
    description: "Reviews about whether the product is worth its price",
    keywords: [
      "value", "worth", "overpriced", "expensive", "cheap", "affordable",
      "bang for the buck", "price", "cost", "deal", "bargain", "rip off",
      "ripoff", "waste of money", "great deal", "good price",
    ],
    isProductRelated: true,
  },
  {
    id: "size-fit",
    label: "Size & Fit",
    icon: "📐",
    description: "Reviews about the physical size, fit, and dimensions of the product",
    keywords: [
      "size", "sizing", "too big", "too small", "too large", "too tight",
      "too loose", "fits perfectly", "doesn't fit", "fit well", "runs small",
      "runs large", "dimensions", "compact", "bulky", "heavy", "lightweight",
      "weight",
    ],
    isProductRelated: true,
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: "🎨",
    description: "Reviews about the visual design and aesthetics of the product",
    keywords: [
      "looks", "look", "design", "color", "colour", "style", "aesthetic",
      "beautiful", "ugly", "attractive", "sleek", "modern", "appearance",
      "finish", "glossy", "matte",
    ],
    isProductRelated: true,
  },
  {
    id: "compatibility",
    label: "Compatibility",
    icon: "🔌",
    description: "Reviews about how well the product works with other devices or systems",
    keywords: [
      "compatible", "compatibility", "works with", "doesn't work with", "fits",
      "adapter", "connector", "port", "bluetooth", "wifi", "pairing",
      "connect", "connection",
    ],
    isProductRelated: true,
  },
  {
    id: "shipping-delivery",
    label: "Shipping & Delivery",
    icon: "🚚",
    description: "Reviews about the shipping speed, packaging, and delivery experience",
    keywords: [
      "shipping", "delivery", "arrived", "late", "delayed", "package",
      "packaging", "box", "damaged in transit", "shipping time",
      "fast shipping", "slow shipping", "days to arrive", "arrived quickly",
      "arrived late", "amazon delivery", "fedex", "ups", "usps", "carrier",
    ],
    isProductRelated: false,
  },
  {
    id: "customer-service",
    label: "Customer Service",
    icon: "📞",
    description: "Reviews about interactions with customer support, returns, and warranties",
    keywords: [
      "customer service", "support", "return", "returned", "refund",
      "replacement", "warranty", "exchange", "response", "seller", "vendor",
      "contact", "help desk",
    ],
    isProductRelated: false,
  },
  {
    id: "user-error",
    label: "User Expectations/Error",
    icon: "❓",
    description: "Reviews where the complaint stems from user misunderstanding or mistake",
    keywords: [
      "didn't read", "my fault", "my mistake", "expected", "thought it was",
      "didn't realize", "i assumed", "not what i thought",
      "different than expected", "not what i expected", "misunderstood",
      "wrong product", "ordered wrong",
    ],
    isProductRelated: false,
  },
  {
    id: "packaging",
    label: "Packaging & Condition",
    icon: "📋",
    description: "Reviews about the product packaging and arrival condition",
    keywords: [
      "packaging", "packaged", "box", "arrived damaged", "dented",
      "scratched", "opened", "used condition", "not new", "repackaged",
      "missing parts", "missing pieces", "incomplete",
    ],
    isProductRelated: false,
  },
];

// Pre-compiled keyword regex per category (built once at module load).
// Each entry maps category id → a single regex that matches any keyword.
const CATEGORY_MATCHERS: { id: string; regex: RegExp }[] = REVIEW_CATEGORIES.map((cat) => {
  const escaped = cat.keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return { id: cat.id, regex: new RegExp(`(?:${escaped.join("|")})`, "i") };
});

// ── Sentence Splitting ──────────────────────────────────────────────

/**
 * Split review text into sentences.
 * Handles abbreviations (Mr., Dr., U.S., etc.), decimals, and ellipses.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text || text.trim().length === 0) return [];

  // Protect common abbreviations and decimals from splitting
  let processed = text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|Inc|Ltd|Co)\./gi, "$1\u0000")
    .replace(/(\d)\./g, "$1\u0000")   // e.g., "4.5 stars"
    .replace(/\.{2,}/g, "\u0001");     // ellipses → placeholder

  // Split on sentence-ending punctuation followed by space or end-of-string
  const raw = processed.split(/(?<=[.!?])\s+|(?<=[.!?])$/);

  // Restore protected characters and clean up
  return raw
    .map((s) => s.replace(/\u0000/g, ".").replace(/\u0001/g, "...").trim())
    .filter((s) => s.length > 0);
}

// ── Implied Rating Detection ────────────────────────────────────────

/**
 * Patterns that indicate "I would have rated higher except for [topic]"
 * Returns the implied higher rating if detected, null otherwise.
 */
const IMPLIED_RATING_PATTERNS = [
  // "would have given/said 5 stars except/but/if not for"
  /would (?:have )?(?:given|said|rated|been)\s+(\d)\s*(?:stars?)?[\s,]*(?:except|but|if not for|were it not for|minus|other than)/i,
  // "this is a 5 star product except for"
  /(?:this is|it's|it is)\s+(?:a\s+)?(\d)\s*(?:star|\/5)[\s,]*(?:product|item)?[\s,]*(?:except|but|if not for|other than)/i,
  // "I'd give 5 stars but"
  /i'?d\s+(?:give|rate)\s+(?:it\s+)?(\d)\s*(?:stars?)?[\s,]*(?:but|except|if not for)/i,
  // "5 stars if not for" / "would be 5 stars but"
  /(?:would be|could be|should be)\s+(\d)\s*(?:stars?)?[\s,]*(?:but|except|if not for)/i,
];

/**
 * Detect implied rating from "would have said X stars except for Y" patterns.
 * Returns the implied rating (1-5) or null.
 */
export function detectImpliedRating(text: string): number | null {
  for (const pattern of IMPLIED_RATING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const rating = parseInt(match[1], 10);
      if (rating >= 1 && rating <= 5) return rating;
    }
  }
  return null;
}

// ── Sentence-Level Categorization ───────────────────────────────────

/** Tag a single sentence with matching category IDs. */
export function categorizeSentence(sentence: string): string[] {
  const matched: string[] = [];
  for (const { id, regex } of CATEGORY_MATCHERS) {
    if (regex.test(sentence)) {
      matched.push(id);
    }
  }
  return matched;
}

// ── Review-Level Categorization (using sentence decomposition) ──────

/** Categorize a single review using sentence-level decomposition. */
export function categorizeReview(review: ReviewData): CategorizedReview {
  const rawSentences = splitIntoSentences(review.text);
  const totalSentences = Math.max(rawSentences.length, 1);
  const weight = 1 / totalSentences;

  const allCategories = new Set<string>();
  const categoryCounts = new Map<string, number>();
  const sentences: CategorizedSentence[] = [];

  for (const sentText of rawSentences) {
    let cats = categorizeSentence(sentText);
    // Uncategorized sentences default to "product-quality"
    if (cats.length === 0) {
      cats = ["product-quality"];
    }
    for (const c of cats) {
      allCategories.add(c);
      categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
    }
    sentences.push({ text: sentText, categories: cats, weight });
  }

  // Primary category = most sentence mentions
  let primaryCategory: string | null = null;
  let maxCount = 0;
  for (const [id, count] of categoryCounts) {
    if (count > maxCount) {
      maxCount = count;
      primaryCategory = id;
    }
  }

  const impliedRating = detectImpliedRating(review.text);

  return {
    review,
    categories: Array.from(allCategories),
    primaryCategory,
    sentences,
    impliedRating,
  };
}

/** Categorize all reviews and produce category summaries. */
export function categorizeAllReviews(reviews: ReviewData[]): {
  categorized: CategorizedReview[];
  summaries: CategorySummary[];
} {
  const categorized = reviews.map(categorizeReview);
  const totalReviews = reviews.length;

  // Single-pass: group reviews by category
  const categoryMap = new Map<string, CategorizedReview[]>();
  for (const cr of categorized) {
    for (const catId of cr.categories) {
      let list = categoryMap.get(catId);
      if (!list) {
        list = [];
        categoryMap.set(catId, list);
      }
      list.push(cr);
    }
  }

  const summaries: CategorySummary[] = [];
  for (const category of REVIEW_CATEGORIES) {
    const matching = categoryMap.get(category.id);
    if (!matching || matching.length === 0) continue;

    const avgRating =
      matching.reduce((sum, cr) => sum + cr.review.rating, 0) / matching.length;
    const sampleSnippet = matching[0].review.text.slice(0, 80);

    summaries.push({
      categoryId: category.id,
      count: matching.length,
      percentage: (matching.length / totalReviews) * 100,
      avgRating,
      sampleSnippet,
    });
  }

  summaries.sort((a, b) => b.count - a.count);

  return { categorized, summaries };
}

// ── Adjusted Rating (sentence-level weighting) ──────────────────────

/**
 * Compute adjusted rating using sentence-level weighting.
 *
 * Instead of dropping entire reviews, we compute each review's contribution
 * by excluding only the sentences about ignored topics. If a review has
 * implied rating ("would have said X stars except for Y"), the non-excepted
 * topics use the implied rating instead of the actual star rating.
 */
export function computeAdjustedRating(
  categorized: CategorizedReview[],
  ignoredCategories: string[],
): { adjustedRating: number; adjustedCount: number } {
  if (ignoredCategories.length === 0) {
    // No filtering — simple average
    const count = categorized.length;
    if (count === 0) return { adjustedRating: 0, adjustedCount: 0 };
    const sum = categorized.reduce((s, cr) => s + cr.review.rating, 0);
    return { adjustedRating: sum / count, adjustedCount: count };
  }

  let totalWeight = 0;
  let weightedRatingSum = 0;
  let contributingReviews = 0;

  for (const cr of categorized) {
    const { sentences, review, impliedRating } = cr;

    // Determine which sentences to keep (not in any ignored category)
    const keptSentences = sentences.filter(
      (s) => !s.categories.some((c) => ignoredCategories.includes(c)),
    );

    if (keptSentences.length === 0) continue; // entire review is about ignored topics

    contributingReviews++;

    // Sum the weight of kept sentences
    const keptWeight = keptSentences.reduce((sum, s) => sum + s.weight, 0);

    // If there's an implied rating and some ignored sentences exist,
    // use the implied rating for the kept portion
    const hasIgnoredSentences = keptSentences.length < sentences.length;
    const effectiveRating = (impliedRating !== null && hasIgnoredSentences)
      ? impliedRating
      : review.rating;

    totalWeight += keptWeight;
    weightedRatingSum += keptWeight * effectiveRating;
  }

  if (totalWeight === 0) return { adjustedRating: 0, adjustedCount: 0 };

  return {
    adjustedRating: weightedRatingSum / totalWeight,
    adjustedCount: contributingReviews,
  };
}

// ── Per-Topic Scores ────────────────────────────────────────────────

/**
 * Compute per-topic average ratings from sentence-level data.
 * Each sentence contributes its review's rating (or implied rating) to its topics.
 */
export function computeTopicScores(
  categorized: CategorizedReview[],
): TopicScore[] {
  const topicData = new Map<string, { totalRating: number; totalWeight: number; reviews: Set<number> }>();

  for (let i = 0; i < categorized.length; i++) {
    const cr = categorized[i];
    for (const sentence of cr.sentences) {
      for (const catId of sentence.categories) {
        if (!topicData.has(catId)) {
          topicData.set(catId, { totalRating: 0, totalWeight: 0, reviews: new Set() });
        }
        const data = topicData.get(catId)!;
        data.totalRating += sentence.weight * cr.review.rating;
        data.totalWeight += sentence.weight;
        data.reviews.add(i);
      }
    }
  }

  const scores: TopicScore[] = [];
  for (const [categoryId, data] of topicData) {
    if (data.totalWeight === 0) continue;
    const avgRating = data.totalRating / data.totalWeight;
    scores.push({
      categoryId,
      avgRating: Math.round(avgRating * 10) / 10,
      sentenceMentions: Math.round(data.totalWeight * categorized.length), // approximate
      reviewMentions: data.reviews.size,
      sentiment: avgRating >= 4.0 ? "positive" : avgRating >= 3.0 ? "mixed" : "negative",
    });
  }

  scores.sort((a, b) => b.reviewMentions - a.reviewMentions);
  return scores;
}

// ── Temporal Trends ─────────────────────────────────────────────────

/**
 * Group reviews into quarterly windows and compute per-topic sentiment over time.
 * Requires at least 2 reviews with valid dates.
 */
export function computeTopicTrends(
  categorized: CategorizedReview[],
): TopicTrendWindow[] {
  // Filter to reviews with valid dates
  const dated = categorized.filter(
    (cr) => cr.review.date && !isNaN(cr.review.date.getTime()),
  );
  if (dated.length < 2) return [];

  // Sort by date
  dated.sort((a, b) => a.review.date.getTime() - b.review.date.getTime());

  // Determine quarter boundaries
  const earliest = dated[0].review.date;
  const latest = dated[dated.length - 1].review.date;

  const windows: TopicTrendWindow[] = [];
  let windowStart = new Date(earliest.getFullYear(), Math.floor(earliest.getMonth() / 3) * 3, 1);

  while (windowStart <= latest) {
    const windowEnd = new Date(windowStart.getFullYear(), windowStart.getMonth() + 3, 1);

    const inWindow = dated.filter((cr) => {
      const t = cr.review.date.getTime();
      return t >= windowStart.getTime() && t < windowEnd.getTime();
    });

    if (inWindow.length > 0) {
      const scores = new Map<string, { total: number; weight: number }>();

      for (const cr of inWindow) {
        for (const sentence of cr.sentences) {
          for (const catId of sentence.categories) {
            if (!scores.has(catId)) scores.set(catId, { total: 0, weight: 0 });
            const d = scores.get(catId)!;
            d.total += sentence.weight * cr.review.rating;
            d.weight += sentence.weight;
          }
        }
      }

      const scoreMap = new Map<string, number>();
      for (const [catId, d] of scores) {
        if (d.weight > 0) scoreMap.set(catId, d.total / d.weight);
      }

      windows.push({
        windowStart: new Date(windowStart),
        windowEnd: new Date(windowEnd),
        scores: scoreMap,
        reviewCount: inWindow.length,
      });
    }

    windowStart = windowEnd;
  }

  return windows;
}

/**
 * Annotate topic scores with trend direction based on temporal windows.
 * Compares the latest window to the previous window(s).
 */
export function annotateTrends(
  topicScores: TopicScore[],
  windows: TopicTrendWindow[],
): TopicScore[] {
  if (windows.length < 2) return topicScores;

  const latest = windows[windows.length - 1];
  const previous = windows[windows.length - 2];

  return topicScores.map((ts) => {
    const latestScore = latest.scores.get(ts.categoryId);
    const prevScore = previous.scores.get(ts.categoryId);
    if (latestScore == null || prevScore == null) return ts;

    const diff = latestScore - prevScore;
    const trend: "rising" | "falling" | "stable" =
      diff > 0.5 ? "rising" : diff < -0.5 ? "falling" : "stable";

    return { ...ts, trend };
  });
}

// ── Main Entry Point ────────────────────────────────────────────────

/** Get the full ProductInsights for a set of reviews and ignored categories. */
export function getProductInsights(
  reviews: ReviewData[],
  ignoredCategories: string[],
): ProductInsights {
  const { categorized, summaries } = categorizeAllReviews(reviews);
  const { adjustedRating, adjustedCount } = computeAdjustedRating(
    categorized,
    ignoredCategories,
  );
  const trendWindows = computeTopicTrends(categorized);
  let topicScores = computeTopicScores(categorized);
  topicScores = annotateTrends(topicScores, trendWindows);

  return {
    categorySummaries: summaries,
    categorizedReviews: categorized,
    adjustedRating,
    adjustedReviewCount: adjustedCount,
    topicScores,
    trendWindows,
  };
}
