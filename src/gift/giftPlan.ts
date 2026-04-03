/**
 * Gift Research Mode — extends shortlists with recipient names and
 * budgets for holiday/birthday gift planning.
 *
 * Builds on the existing shortlist system in src/shortlist/storage.ts.
 * Adds a gift-specific overlay with budget tracking per recipient.
 *
 * Storage: chrome.storage.sync under key "bas_gift_plans".
 */

// ── Types ────────────────────────────────────────────────────────────

export interface GiftRecipient {
  name: string;
  budget: number;
  /** Shortlist name that holds this recipient's items. */
  shortlistName: string;
}

export interface GiftPlan {
  /** Plan name (e.g., "Christmas 2026"). */
  name: string;
  recipients: GiftRecipient[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "bas_gift_plans";
const MAX_PLANS = 5;
const MAX_RECIPIENTS = 20;

// ── Storage ──────────────────────────────────────────────────────────

export async function loadGiftPlans(): Promise<GiftPlan[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError || !result[STORAGE_KEY]) {
        resolve([]);
        return;
      }
      resolve(result[STORAGE_KEY] as GiftPlan[]);
    });
  });
}

async function saveGiftPlans(plans: GiftPlan[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: plans }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

// ── CRUD ─────────────────────────────────────────────────────────────

export async function createGiftPlan(name: string): Promise<void> {
  const plans = await loadGiftPlans();
  if (plans.length >= MAX_PLANS) throw new Error(`Maximum ${MAX_PLANS} gift plans allowed`);
  if (plans.some((p) => p.name === name)) throw new Error("Plan already exists");

  plans.push({
    name,
    recipients: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await saveGiftPlans(plans);
}

export async function deleteGiftPlan(name: string): Promise<void> {
  const plans = await loadGiftPlans();
  await saveGiftPlans(plans.filter((p) => p.name !== name));
}

export async function addRecipient(
  planName: string,
  recipientName: string,
  budget: number,
  shortlistName: string,
): Promise<void> {
  const plans = await loadGiftPlans();
  const plan = plans.find((p) => p.name === planName);
  if (!plan) throw new Error("Plan not found");
  if (plan.recipients.length >= MAX_RECIPIENTS) throw new Error(`Maximum ${MAX_RECIPIENTS} recipients per plan`);
  if (plan.recipients.some((r) => r.name === recipientName)) throw new Error("Recipient already exists");

  plan.recipients.push({ name: recipientName, budget, shortlistName });
  plan.updatedAt = Date.now();
  await saveGiftPlans(plans);
}

export async function removeRecipient(planName: string, recipientName: string): Promise<void> {
  const plans = await loadGiftPlans();
  const plan = plans.find((p) => p.name === planName);
  if (!plan) return;

  plan.recipients = plan.recipients.filter((r) => r.name !== recipientName);
  plan.updatedAt = Date.now();
  await saveGiftPlans(plans);
}

export async function updateRecipientBudget(
  planName: string,
  recipientName: string,
  newBudget: number,
): Promise<void> {
  const plans = await loadGiftPlans();
  const plan = plans.find((p) => p.name === planName);
  if (!plan) return;

  const recipient = plan.recipients.find((r) => r.name === recipientName);
  if (recipient) {
    recipient.budget = newBudget;
    plan.updatedAt = Date.now();
    await saveGiftPlans(plans);
  }
}

// ── Budget Tracking ──────────────────────────────────────────────────

export interface RecipientBudgetStatus {
  name: string;
  budget: number;
  spent: number;
  remaining: number;
  itemCount: number;
  overBudget: boolean;
}

/**
 * Compute budget status for each recipient in a plan.
 * Requires the shortlist items to compute total spent.
 */
export function computeBudgetStatus(
  recipient: GiftRecipient,
  shortlistItems: { price: number | null }[],
): RecipientBudgetStatus {
  const spent = shortlistItems
    .filter((item) => item.price != null)
    .reduce((sum, item) => sum + item.price!, 0);

  return {
    name: recipient.name,
    budget: recipient.budget,
    spent: Math.round(spent * 100) / 100,
    remaining: Math.round((recipient.budget - spent) * 100) / 100,
    itemCount: shortlistItems.length,
    overBudget: spent > recipient.budget,
  };
}

// ── Export ────────────────────────────────────────────────────────────

export interface GiftPlanExport {
  planName: string;
  recipients: {
    name: string;
    budget: number;
    spent: number;
    remaining: number;
    items: { title: string; price: number | null; url: string }[];
  }[];
  totalBudget: number;
  totalSpent: number;
}

export function exportGiftPlanText(exportData: GiftPlanExport): string {
  const lines: string[] = [];
  lines.push(`🎁 Gift Plan: ${exportData.planName}`);
  lines.push(`Total Budget: $${exportData.totalBudget.toFixed(2)} | Spent: $${exportData.totalSpent.toFixed(2)}`);
  lines.push("");

  for (const r of exportData.recipients) {
    lines.push(`👤 ${r.name} — Budget: $${r.budget.toFixed(2)} | Spent: $${r.spent.toFixed(2)} | Remaining: $${r.remaining.toFixed(2)}`);
    for (const item of r.items) {
      const price = item.price != null ? `$${item.price.toFixed(2)}` : "N/A";
      lines.push(`  • ${item.title} — ${price}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
