/**
 * Purchase Decision Journal — lets users mark products as "Bought"
 * and tracks quality scores at purchase time. Prompts for satisfaction
 * rating after 30 days. Creates irreplaceable personal shopping history.
 *
 * Storage: chrome.storage.local under key "bas_purchase_journal".
 */

// ── Types ────────────────────────────────────────────────────────────

export interface PurchaseEntry {
  asin: string;
  title: string;
  brand: string;
  price: number;
  reviewScore?: number;
  trustScore?: number;
  dealScore?: number;
  purchasedAt: string;
  satisfaction?: number;
  satisfactionPrompted?: boolean;
  domain: string;
}

export interface PurchaseJournal {
  entries: PurchaseEntry[];
}

const STORAGE_KEY = "bas_purchase_journal";
const MAX_ENTRIES = 200;

// ── Storage ──────────────────────────────────────────────────────────

export async function loadJournal(): Promise<PurchaseJournal> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError || !result[STORAGE_KEY]) {
        resolve({ entries: [] });
        return;
      }
      resolve(result[STORAGE_KEY] as PurchaseJournal);
    });
  });
}

async function saveJournal(journal: PurchaseJournal): Promise<void> {
  if (journal.entries.length > MAX_ENTRIES) {
    journal.entries = journal.entries.slice(-MAX_ENTRIES);
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: journal }, () => resolve());
  });
}

// ── CRUD ─────────────────────────────────────────────────────────────

export async function addPurchase(entry: Omit<PurchaseEntry, "purchasedAt">): Promise<void> {
  const journal = await loadJournal();
  if (journal.entries.some((e) => e.asin === entry.asin)) return;
  journal.entries.push({ ...entry, purchasedAt: new Date().toISOString() });
  await saveJournal(journal);
}

export async function removePurchase(asin: string): Promise<void> {
  const journal = await loadJournal();
  journal.entries = journal.entries.filter((e) => e.asin !== asin);
  await saveJournal(journal);
}

export async function rateSatisfaction(asin: string, rating: number): Promise<void> {
  const journal = await loadJournal();
  const entry = journal.entries.find((e) => e.asin === asin);
  if (entry) {
    entry.satisfaction = rating;
    entry.satisfactionPrompted = true;
    await saveJournal(journal);
  }
}

export async function isPurchased(asin: string): Promise<boolean> {
  const journal = await loadJournal();
  return journal.entries.some((e) => e.asin === asin);
}

// ── Analytics ────────────────────────────────────────────────────────

export interface PurchaseStats {
  totalPurchases: number;
  averageTrustScore: number | null;
  averageSatisfaction: number | null;
  satisfiedPurchaseAvgTrust: number | null;
  regrettedPurchaseAvgTrust: number | null;
  suggestedMinTrust: number | null;
}

export async function getPurchaseStats(): Promise<PurchaseStats> {
  const journal = await loadJournal();
  const entries = journal.entries;

  if (entries.length === 0) {
    return { totalPurchases: 0, averageTrustScore: null, averageSatisfaction: null, satisfiedPurchaseAvgTrust: null, regrettedPurchaseAvgTrust: null, suggestedMinTrust: null };
  }

  const withTrust = entries.filter((e) => e.trustScore != null);
  const averageTrustScore = withTrust.length > 0
    ? Math.round(withTrust.reduce((sum, e) => sum + e.trustScore!, 0) / withTrust.length)
    : null;

  const withSat = entries.filter((e) => e.satisfaction != null);
  const averageSatisfaction = withSat.length > 0
    ? Math.round(withSat.reduce((sum, e) => sum + e.satisfaction!, 0) / withSat.length * 10) / 10
    : null;

  const satisfied = withSat.filter((e) => e.satisfaction! >= 4 && e.trustScore != null);
  const regretted = withSat.filter((e) => e.satisfaction! <= 2 && e.trustScore != null);

  const satisfiedPurchaseAvgTrust = satisfied.length > 0
    ? Math.round(satisfied.reduce((sum, e) => sum + e.trustScore!, 0) / satisfied.length)
    : null;
  const regrettedPurchaseAvgTrust = regretted.length > 0
    ? Math.round(regretted.reduce((sum, e) => sum + e.trustScore!, 0) / regretted.length)
    : null;

  const suggestedMinTrust = regrettedPurchaseAvgTrust != null
    ? Math.min(regrettedPurchaseAvgTrust + 10, 70)
    : null;

  return { totalPurchases: entries.length, averageTrustScore, averageSatisfaction, satisfiedPurchaseAvgTrust, regrettedPurchaseAvgTrust, suggestedMinTrust };
}

/** Get entries needing satisfaction prompts (30+ days old, not yet prompted). */
export async function getEntriesNeedingRating(): Promise<PurchaseEntry[]> {
  const journal = await loadJournal();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return journal.entries.filter((e) => {
    if (e.satisfactionPrompted) return false;
    return new Date(e.purchasedAt).getTime() < thirtyDaysAgo;
  });
}
