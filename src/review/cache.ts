import type { ReviewScore, CachedReviewScore } from "./types";

const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_KEY_PREFIX = "review_";

function cacheKey(asin: string): string {
  return `${CACHE_KEY_PREFIX}${asin}`;
}

export async function getCachedScore(
  asin: string,
): Promise<ReviewScore | null> {
  const key = cacheKey(asin);

  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        console.error("cache read failed:", chrome.runtime.lastError.message);
        resolve(null);
        return;
      }

      const entry = result[key] as CachedReviewScore | undefined;
      if (!entry || Date.now() - entry.cachedAt > CACHE_TTL) {
        resolve(null);
        return;
      }

      resolve(entry.score);
    });
  });
}

export async function setCachedScore(
  asin: string,
  score: ReviewScore,
): Promise<void> {
  const key = cacheKey(asin);
  const entry: CachedReviewScore = { asin, score, cachedAt: Date.now() };

  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: entry }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function clearExpiredScores(): Promise<void> {
  const all = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(null, (items) => {
      if (chrome.runtime.lastError) {
        console.error(
          "cache read failed:",
          chrome.runtime.lastError.message,
        );
        resolve({});
        return;
      }
      resolve(items);
    });
  });

  const now = Date.now();
  const expiredKeys = Object.keys(all).filter((key) => {
    if (!key.startsWith(CACHE_KEY_PREFIX)) return false;
    const entry = all[key] as CachedReviewScore;
    return now - entry.cachedAt > CACHE_TTL;
  });

  if (expiredKeys.length === 0) return;

  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(expiredKeys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function clearAllScores(): Promise<void> {
  const all = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(null, (items) => {
      if (chrome.runtime.lastError) {
        console.error(
          "cache read failed:",
          chrome.runtime.lastError.message,
        );
        resolve({});
        return;
      }
      resolve(items);
    });
  });

  const reviewKeys = Object.keys(all).filter((key) =>
    key.startsWith(CACHE_KEY_PREFIX),
  );

  if (reviewKeys.length === 0) return;

  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(reviewKeys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}
