/**
 * Shopping Insights Tracker — records aggregate usage statistics locally
 * to show users the value they're getting from the extension.
 *
 * "You analyzed 347 products, avoided 23 suspicious listings, and saved
 * an estimated $142 this month."
 *
 * Storage: chrome.storage.local under key "bas_insights".
 * All data is aggregate counters — no PII, no individual product data.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface MonthlyInsights {
  /** YYYY-MM key for the month. */
  month: string;
  /** Total products analyzed (shown on search results). */
  productsAnalyzed: number;
  /** Products flagged with low trust scores (<50). */
  suspiciousListingsFlagged: number;
  /** Products where deal score detected price manipulation. */
  inflatedPricesDetected: number;
  /** Estimated dollars saved via deal scoring + savings detection. */
  estimatedSavings: number;
  /** Price drop alerts triggered on watchlist. */
  priceDropsCaught: number;
  /** Products where recall match was found. */
  recallsDetected: number;
  /** Number of searches enhanced. */
  searchesEnhanced: number;
  /** Products exported (CSV/JSON). */
  productsExported: number;
  /** Products added to compare tray. */
  productsCompared: number;
}

export interface InsightsData {
  /** Per-month insights. */
  months: Record<string, MonthlyInsights>;
  /** All-time totals. */
  allTime: MonthlyInsights;
}

const STORAGE_KEY = "bas_insights";
const MAX_MONTHS = 12;

// ── Helpers ──────────────────────────────────────────────────────────

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function createEmptyMonth(month: string): MonthlyInsights {
  return {
    month,
    productsAnalyzed: 0,
    suspiciousListingsFlagged: 0,
    inflatedPricesDetected: 0,
    estimatedSavings: 0,
    priceDropsCaught: 0,
    recallsDetected: 0,
    searchesEnhanced: 0,
    productsExported: 0,
    productsCompared: 0,
  };
}

function createEmptyAllTime(): MonthlyInsights {
  return createEmptyMonth("all-time");
}

// ── Storage ──────────────────────────────────────────────────────────

/** Load insights data from chrome.storage.local. */
export async function loadInsights(): Promise<InsightsData> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError || !result[STORAGE_KEY]) {
        resolve({ months: {}, allTime: createEmptyAllTime() });
        return;
      }
      resolve(result[STORAGE_KEY] as InsightsData);
    });
  });
}

/** Save insights data to chrome.storage.local. */
async function saveInsights(data: InsightsData): Promise<void> {
  // Trim old months (keep last MAX_MONTHS)
  const monthKeys = Object.keys(data.months).sort();
  if (monthKeys.length > MAX_MONTHS) {
    const toRemove = monthKeys.slice(0, monthKeys.length - MAX_MONTHS);
    for (const key of toRemove) delete data.months[key];
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: data }, () => resolve());
  });
}

// ── Tracking Functions ───────────────────────────────────────────────

/** Increment a counter for the current month and all-time. */
async function increment(
  field: keyof Omit<MonthlyInsights, "month">,
  amount = 1,
): Promise<void> {
  const data = await loadInsights();
  const month = getCurrentMonth();

  if (!data.months[month]) {
    data.months[month] = createEmptyMonth(month);
  }

  (data.months[month][field] as number) += amount;
  (data.allTime[field] as number) += amount;

  await saveInsights(data);
}

/** Record that products were analyzed on a search page. */
export async function trackProductsAnalyzed(count: number): Promise<void> {
  await increment("productsAnalyzed", count);
}

/** Record a suspicious listing detected. */
export async function trackSuspiciousListing(): Promise<void> {
  await increment("suspiciousListingsFlagged");
}

/** Record an inflated price detected. */
export async function trackInflatedPrice(): Promise<void> {
  await increment("inflatedPricesDetected");
}

/** Record estimated savings from a deal/savings detection. */
export async function trackSavings(amount: number): Promise<void> {
  if (amount > 0) {
    await increment("estimatedSavings", Math.round(amount * 100) / 100);
  }
}

/** Record a price drop caught on the watchlist. */
export async function trackPriceDrop(): Promise<void> {
  await increment("priceDropsCaught");
}

/** Record a recall match found. */
export async function trackRecallDetected(): Promise<void> {
  await increment("recallsDetected");
}

/** Record a search page enhanced. */
export async function trackSearchEnhanced(): Promise<void> {
  await increment("searchesEnhanced");
}

/** Record products exported. */
export async function trackProductsExported(count: number): Promise<void> {
  await increment("productsExported", count);
}

/** Record product added to compare. */
export async function trackProductCompared(): Promise<void> {
  await increment("productsCompared");
}

/** Get insights for the current month. */
export async function getCurrentMonthInsights(): Promise<MonthlyInsights> {
  const data = await loadInsights();
  const month = getCurrentMonth();
  return data.months[month] ?? createEmptyMonth(month);
}

/** Get all-time insights. */
export async function getAllTimeInsights(): Promise<MonthlyInsights> {
  const data = await loadInsights();
  return data.allTime;
}

/** Get monthly insights for the last N months (for trend display). */
export async function getMonthlyTrend(months = 6): Promise<MonthlyInsights[]> {
  const data = await loadInsights();
  const keys = Object.keys(data.months).sort().slice(-months);
  return keys.map((k) => data.months[k]);
}
