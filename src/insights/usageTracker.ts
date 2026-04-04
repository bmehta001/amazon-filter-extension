/**
 * Usage Tracker — records engagement and conversion-intent metrics
 * locally for pricing, feature, and retention decisions.
 *
 * No PII. No external transmission. Pure local analytics.
 * Storage: chrome.storage.local under key "bas_usage".
 */

// ── Types ────────────────────────────────────────────────────────────

export interface UsageData {
  /** ISO date string of first install. Never changes. */
  installDate: string;
  /** ISO date string of last activity. */
  lastActiveDate: string;
  /** Lifetime session count. */
  totalSessions: number;
  /** ISO date strings of sessions in the current rolling 7-day window. */
  weeklySessionDates: string[];
  /** Feature usage counts: feature-id → total uses. */
  featuresUsed: Record<string, number>;
  /** Pro lock badge click counts: feature-id → clicks. */
  proLockClicks: Record<string, number>;
  /** Filter usage counts: filter-name → times applied. */
  filtersApplied: Record<string, number>;
  /** Total popup opens. */
  popupOpens: number;
  /** Whether onboarding was completed. */
  onboardingCompleted: boolean;
}

const USAGE_KEY = "bas_usage";

// ── Storage ──────────────────────────────────────────────────────────

const DEFAULT_USAGE: UsageData = {
  installDate: new Date().toISOString(),
  lastActiveDate: new Date().toISOString(),
  totalSessions: 0,
  weeklySessionDates: [],
  featuresUsed: {},
  proLockClicks: {},
  filtersApplied: {},
  popupOpens: 0,
  onboardingCompleted: false,
};

export async function loadUsage(): Promise<UsageData> {
  return new Promise((resolve) => {
    chrome.storage.local.get(USAGE_KEY, (result) => {
      if (chrome.runtime.lastError || !result[USAGE_KEY]) {
        resolve({ ...DEFAULT_USAGE });
        return;
      }
      resolve({ ...DEFAULT_USAGE, ...result[USAGE_KEY] });
    });
  });
}

async function saveUsage(data: UsageData): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [USAGE_KEY]: data }, () => resolve());
  });
}

// Serialization to prevent race conditions (same pattern as dashboard.ts)
let pendingOp: Promise<void> = Promise.resolve();
function serialize(fn: () => Promise<void>): Promise<void> {
  pendingOp = pendingOp.then(fn, fn);
  return pendingOp;
}

// ── Tracking Functions ───────────────────────────────────────────────

/** Record the start of a new session (page load on Amazon search). */
export async function recordSession(): Promise<void> {
  return serialize(async () => {
    const data = await loadUsage();
    const today = new Date().toISOString().slice(0, 10);

    data.totalSessions++;
    data.lastActiveDate = new Date().toISOString();

    // Rolling 7-day window for weekly session count
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    data.weeklySessionDates = data.weeklySessionDates
      .filter((d) => new Date(d).getTime() > sevenDaysAgo);
    data.weeklySessionDates.push(today);

    await saveUsage(data);
  });
}

/** Record usage of a specific feature. */
export async function recordFeatureUsed(featureId: string): Promise<void> {
  return serialize(async () => {
    const data = await loadUsage();
    data.featuresUsed[featureId] = (data.featuresUsed[featureId] || 0) + 1;
    await saveUsage(data);
  });
}

/** Record a click on a Pro lock badge (upgrade intent signal). */
export async function recordProLockClick(featureId: string): Promise<void> {
  return serialize(async () => {
    const data = await loadUsage();
    data.proLockClicks[featureId] = (data.proLockClicks[featureId] || 0) + 1;
    await saveUsage(data);
  });
}

/** Record a filter being applied. */
export async function recordFilterApplied(filterName: string): Promise<void> {
  return serialize(async () => {
    const data = await loadUsage();
    data.filtersApplied[filterName] = (data.filtersApplied[filterName] || 0) + 1;
    await saveUsage(data);
  });
}

/** Record a popup open. */
export async function recordPopupOpen(): Promise<void> {
  return serialize(async () => {
    const data = await loadUsage();
    data.popupOpens++;
    await saveUsage(data);
  });
}

/** Mark onboarding as completed. */
export async function markOnboardingCompleted(): Promise<void> {
  return serialize(async () => {
    const data = await loadUsage();
    data.onboardingCompleted = true;
    await saveUsage(data);
  });
}

// ── Derived Metrics ──────────────────────────────────────────────────

/** Days since install. */
export async function getRetentionDays(): Promise<number> {
  const data = await loadUsage();
  const installDate = new Date(data.installDate).getTime();
  return Math.floor((Date.now() - installDate) / (24 * 60 * 60 * 1000));
}

/** Sessions in the last 7 days. */
export async function getWeeklySessions(): Promise<number> {
  const data = await loadUsage();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return data.weeklySessionDates.filter((d) => new Date(d).getTime() > sevenDaysAgo).length;
}

/** Number of distinct features used. */
export async function getFeatureBreadth(): Promise<number> {
  const data = await loadUsage();
  return Object.keys(data.featuresUsed).length;
}

/** Top N features by usage count. */
export async function getTopFeatures(n = 5): Promise<{ feature: string; count: number }[]> {
  const data = await loadUsage();
  return Object.entries(data.featuresUsed)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([feature, count]) => ({ feature, count }));
}

/** Top Pro features by lock click count (upgrade intent). */
export async function getTopProLockClicks(n = 5): Promise<{ feature: string; clicks: number }[]> {
  const data = await loadUsage();
  return Object.entries(data.proLockClicks)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([feature, clicks]) => ({ feature, clicks }));
}

/** Initialize usage data on first install (sets installDate). */
export async function initUsageOnInstall(): Promise<void> {
  const data = await loadUsage();
  if (!data.installDate || data.totalSessions === 0) {
    await saveUsage({ ...DEFAULT_USAGE, installDate: new Date().toISOString() });
  }
}
