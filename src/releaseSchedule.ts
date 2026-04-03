/**
 * Release Schedule — controls which features are enabled in each release wave.
 *
 * All code is built and tested, but features are rolled out gradually to:
 * 1. Generate multiple Chrome Web Store "updated" signals (ranking boost)
 * 2. Create distinct marketing moments per release
 * 3. Measure which features drive installs/upgrades
 * 4. Avoid overwhelming new users
 *
 * Usage in index.ts:
 *   if (isReleased("deal-scoring")) { ... }
 *
 * To advance to the next wave: increment CURRENT_WAVE and push an update.
 */

// ── Release Waves ────────────────────────────────────────────────────

export type ReleaseWave =
  | 1  // Launch: core free features
  | 2  // Enable Pro gating + teasers
  | 3  // Shopping Intelligence (dashboard, red flag report)
  | 4  // Safety (recall, listing audit)
  | 5  // Deal Intelligence (deal scoring, price intel, locale peek)
  | 6  // Research Tools (compare, alternatives, export)
  | 7  // Power Shopper (journal, gift mode)
  | 8; // Seller Tools (reseller mode)

/**
 * Current release wave. Increment this and push an update to
 * roll out the next set of features. Start at 1 for initial launch.
 */
export const CURRENT_WAVE: ReleaseWave = 1;

// ── Feature-to-Wave Mapping ──────────────────────────────────────────

/**
 * Maps each feature to the wave in which it becomes active.
 * Wave 1 features are available from day 1.
 */
const WAVE_MAP: Record<string, ReleaseWave> = {
  // Wave 1 — Launch (free core)
  "basic-filters":         1,
  "hide-sponsored":        1,
  "sort":                  1,
  "simple-review-grade":   1,
  "brand-trust-block":     1,
  "onboarding":            1,
  "keepa-sparkline-link":  1,
  "one-shortlist":         1,

  // Wave 2 — Enable Pro gating
  "pro-gating":            2,
  "pro-teasers":           2,
  "lifetime-deal":         2,

  // Wave 3 — Shopping Intelligence
  "insights-dashboard":    3,
  "red-flag-report":       3,
  "review-forensics":      3,

  // Wave 4 — Safety
  "recall-safety":         4,
  "listing-completeness":  4,
  "listing-quality-badge": 4,

  // Wave 5 — Deal Intelligence
  "deal-scoring":          5,
  "price-intel":           5,
  "savings-breakdown":     5,
  "locale-price-peek":     5,
  "price-sparklines":      5,

  // Wave 6 — Research Tools
  "compare-tray":          6,
  "alternatives":          6,
  "export":                6,
  "advanced-search":       6,
  "unlimited-shortlists":  6,

  // Wave 7 — Power Shopper
  "purchase-journal":      7,
  "gift-mode":             7,
  "review-gallery":        7,
  "category-weights":      7,

  // Wave 8 — Seller Tools
  "reseller-mode":         8,
  "bsr-extraction":        8,
  "seller-trust":          8,
  "listing-integrity":     8,
};

// ── Public API ───────────────────────────────────────────────────────

/** Check if a feature has been released in the current wave. */
export function isReleased(feature: string): boolean {
  const requiredWave = WAVE_MAP[feature];
  if (requiredWave === undefined) return true; // Unknown features default to released
  return CURRENT_WAVE >= requiredWave;
}

/** Get all features released in or before the current wave. */
export function getReleasedFeatures(): string[] {
  return Object.entries(WAVE_MAP)
    .filter(([, wave]) => CURRENT_WAVE >= wave)
    .map(([feature]) => feature);
}

/** Get features coming in the next wave (for "Coming Soon" UI). */
export function getUpcomingFeatures(): string[] {
  if (CURRENT_WAVE >= 8) return [];
  const nextWave = (CURRENT_WAVE + 1) as ReleaseWave;
  return Object.entries(WAVE_MAP)
    .filter(([, wave]) => wave === nextWave)
    .map(([feature]) => feature);
}

/** Get the wave number for a feature. */
export function getFeatureWave(feature: string): ReleaseWave | undefined {
  return WAVE_MAP[feature];
}

// ── Wave Metadata (for changelog / marketing) ────────────────────────

export interface WaveMeta {
  wave: ReleaseWave;
  name: string;
  tagline: string;
  blogTitle: string;
  targetAudience: string;
}

export const WAVE_METADATA: WaveMeta[] = [
  {
    wave: 1,
    name: "Launch",
    tagline: "Smart filters for Amazon search",
    blogTitle: "Introducing Better Amazon Search",
    targetAudience: "All Amazon shoppers",
  },
  {
    wave: 2,
    name: "Pro Launch",
    tagline: "Unlock deeper intelligence",
    blogTitle: "Better Amazon Search Pro is here — Early Adopter Lifetime Deal",
    targetAudience: "Power shoppers",
  },
  {
    wave: 3,
    name: "Shopping Intelligence",
    tagline: "See exactly how much you save",
    blogTitle: "Your Shopping Insights Dashboard — See How Much Better Amazon Search Saves You",
    targetAudience: "Value-conscious shoppers",
  },
  {
    wave: 4,
    name: "Safety First",
    tagline: "Protect your family from recalled products",
    blogTitle: "How to Check if Amazon Products Are Recalled — Before You Buy",
    targetAudience: "Parents, safety-conscious buyers",
  },
  {
    wave: 5,
    name: "Deal Intelligence",
    tagline: "Spot fake deals and find real savings",
    blogTitle: "Is That Amazon Deal Real? How to Spot Fake Discounts",
    targetAudience: "Deal hunters, bargain shoppers",
  },
  {
    wave: 6,
    name: "Research Tools",
    tagline: "Compare products without opening 20 tabs",
    blogTitle: "How to Compare Amazon Products Like a Pro",
    targetAudience: "Careful researchers",
  },
  {
    wave: 7,
    name: "Power Shopper",
    tagline: "Track purchases and plan gifts",
    blogTitle: "Track Every Amazon Purchase and Never Regret a Buy",
    targetAudience: "Frequent shoppers, gift planners",
  },
  {
    wave: 8,
    name: "Seller Tools",
    tagline: "Product research for Amazon sellers",
    blogTitle: "Free FBA Product Research: BSR Estimates, Margin Calculator, Competition Analysis",
    targetAudience: "FBA sellers, resellers, r/FulfillmentByAmazon",
  },
];

/** Get metadata for the current wave. */
export function getCurrentWaveMeta(): WaveMeta {
  return WAVE_METADATA.find((m) => m.wave === CURRENT_WAVE) ?? WAVE_METADATA[0];
}
