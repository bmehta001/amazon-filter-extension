import type { ReviewData, CategorizedReview, CategorySummary, ProductInsights } from "./types";

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

/** Categorize a single review into matching categories. */
export function categorizeReview(review: ReviewData): CategorizedReview {
  const lowerText = review.text.toLowerCase();
  const matchCounts = new Map<string, number>();

  for (const category of REVIEW_CATEGORIES) {
    let count = 0;
    for (const keyword of category.keywords) {
      if (lowerText.includes(keyword)) {
        count++;
      }
    }
    if (count > 0) {
      matchCounts.set(category.id, count);
    }
  }

  const categories = Array.from(matchCounts.keys());

  let primaryCategory: string | null = null;
  if (categories.length > 0) {
    let maxCount = 0;
    for (const [id, count] of matchCounts) {
      if (count > maxCount) {
        maxCount = count;
        primaryCategory = id;
      }
    }
  }

  return { review, categories, primaryCategory };
}

/** Categorize all reviews and produce category summaries. */
export function categorizeAllReviews(reviews: ReviewData[]): {
  categorized: CategorizedReview[];
  summaries: CategorySummary[];
} {
  const categorized = reviews.map(categorizeReview);
  const totalReviews = reviews.length;

  const summaries: CategorySummary[] = [];

  for (const category of REVIEW_CATEGORIES) {
    const matching = categorized.filter((cr) =>
      cr.categories.includes(category.id),
    );
    if (matching.length === 0) continue;

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

/** Compute adjusted rating excluding reviews from specified categories. */
export function computeAdjustedRating(
  categorized: CategorizedReview[],
  ignoredCategories: string[],
): { adjustedRating: number; adjustedCount: number } {
  const kept = categorized.filter(
    (cr) =>
      cr.primaryCategory === null ||
      !ignoredCategories.includes(cr.primaryCategory),
  );

  const adjustedCount = kept.length;
  const adjustedRating =
    adjustedCount > 0
      ? kept.reduce((sum, cr) => sum + cr.review.rating, 0) / adjustedCount
      : 0;

  return { adjustedRating, adjustedCount };
}

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

  return {
    categorySummaries: summaries,
    categorizedReviews: categorized,
    adjustedRating,
    adjustedReviewCount: adjustedCount,
  };
}
