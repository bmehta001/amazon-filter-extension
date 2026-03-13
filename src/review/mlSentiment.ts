import type { TextClassificationPipeline } from "@huggingface/transformers";

const MODEL_NAME = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";

let classifier: TextClassificationPipeline | null = null;
let modelLoaded = false;

/** Check if the ML model has been loaded. */
export function isModelLoaded(): boolean {
  return modelLoaded;
}

/** Load the sentiment analysis model (lazy, cached after first load). */
export async function loadModel(): Promise<boolean> {
  if (modelLoaded && classifier) return true;

  try {
    console.log("[BAS] Loading ML sentiment model…");
    const { pipeline } = await import("@huggingface/transformers");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    classifier = (await (pipeline as any)("text-classification", MODEL_NAME, {
      dtype: "q8",
    })) as TextClassificationPipeline;
    modelLoaded = true;
    console.log("[BAS] ML sentiment model loaded successfully");
    return true;
  } catch (err) {
    console.log("[BAS] Failed to load ML sentiment model:", err);
    return false;
  }
}

/** Analyze sentiment of review text. Returns null if model not loaded or error. */
export async function analyzeSentiment(
  text: string,
): Promise<{ label: string; score: number } | null> {
  if (!modelLoaded || !classifier) return null;

  try {
    const results = await classifier(text, { top_k: 1 });
    // Results for a single string input is TextClassificationSingle[]
    const top = (results as { label: string; score: number }[])[0];
    if (!top || typeof top.label !== "string" || typeof top.score !== "number") {
      return null;
    }
    return { label: top.label, score: top.score };
  } catch {
    return null;
  }
}

/**
 * Detect if a review's sentiment mismatches its star rating.
 * E.g., 5-star review with negative sentiment = suspicious.
 * Returns a deduction (0-20) and optional reason.
 */
export async function detectSentimentMismatch(
  text: string,
  rating: number,
): Promise<{ deduction: number; reason: string | null }> {
  const sentiment = await analyzeSentiment(text);
  if (!sentiment) return { deduction: 0, reason: null };

  const isPositive = sentiment.label === "POSITIVE";
  const isNegative = sentiment.label === "NEGATIVE";
  const confident = sentiment.score > 0.7;

  if (rating >= 4 && isNegative && confident) {
    return { deduction: 15, reason: "Positive rating contradicts negative sentiment" };
  }

  if (rating <= 2 && isPositive && confident) {
    return { deduction: 10, reason: "Negative rating contradicts positive sentiment" };
  }

  return { deduction: 0, reason: null };
}
