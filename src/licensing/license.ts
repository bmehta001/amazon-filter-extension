/**
 * License management — stores the user's tier (free/pro) and provides
 * helpers for checking access. Designed to work with ExtensionPay,
 * LemonSqueezy, or any license key system.
 *
 * Storage: chrome.storage.sync under key "bas_license".
 * Default: free tier (all premium features gated).
 */

// ── Types ────────────────────────────────────────────────────────────

export type LicenseTier = "free" | "pro";

export interface LicenseState {
  /** Current tier. */
  tier: LicenseTier;
  /** License key (if using key-based validation). */
  licenseKey?: string;
  /** ISO timestamp when the license was activated. */
  activatedAt?: string;
  /** ISO timestamp when the license expires (undefined = lifetime). */
  expiresAt?: string;
  /** Whether the license is a lifetime deal. */
  isLifetime?: boolean;
}

const STORAGE_KEY = "bas_license";

const DEFAULT_LICENSE: LicenseState = {
  tier: "free",
};

// ── Storage ──────────────────────────────────────────────────────────

/** Load the current license state. Defaults to free tier. */
export async function loadLicense(): Promise<LicenseState> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve({ ...DEFAULT_LICENSE });
        return;
      }
      const stored = result[STORAGE_KEY] as Partial<LicenseState> | undefined;
      resolve({ ...DEFAULT_LICENSE, ...stored });
    });
  });
}

/** Save the license state. */
export async function saveLicense(license: LicenseState): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: license }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Check if the user has an active Pro license. */
export async function isPro(): Promise<boolean> {
  const license = await loadLicense();
  if (license.tier !== "pro") return false;

  // Check expiration (if not lifetime)
  if (!license.isLifetime && license.expiresAt) {
    const now = Date.now();
    const expires = new Date(license.expiresAt).getTime();
    if (now > expires) return false;
  }

  return true;
}

/** Activate a Pro license. */
export async function activatePro(
  licenseKey: string,
  expiresAt?: string,
  isLifetime = false,
): Promise<void> {
  await saveLicense({
    tier: "pro",
    licenseKey,
    activatedAt: new Date().toISOString(),
    expiresAt,
    isLifetime,
  });
}

/** Deactivate the Pro license (revert to free). */
export async function deactivatePro(): Promise<void> {
  await saveLicense({ ...DEFAULT_LICENSE });
}

/** Listen for license changes (e.g., activated from popup while on Amazon). */
export function onLicenseChanged(callback: (license: LicenseState) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[STORAGE_KEY]) {
      callback(changes[STORAGE_KEY].newValue as LicenseState);
    }
  });
}
