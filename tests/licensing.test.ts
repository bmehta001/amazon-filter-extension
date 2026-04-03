import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Chrome storage mock ──

let storedData: Record<string, unknown> = {};

vi.stubGlobal("chrome", {
  storage: {
    sync: {
      get(keyOrKeys: string | string[], cb: (result: Record<string, unknown>) => void) {
        const keys = typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys;
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (key in storedData) result[key] = storedData[key];
        }
        cb(result);
      },
      set(data: Record<string, unknown>, cb?: () => void) {
        Object.assign(storedData, data);
        cb?.();
      },
    },
    local: {
      get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
      set: vi.fn((_d: unknown, cb?: () => void) => cb?.()),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined, sendMessage: vi.fn() },
});

import {
  loadLicense,
  saveLicense,
  isPro,
  activatePro,
  deactivatePro,
} from "../src/licensing/license";
import type { LicenseState } from "../src/licensing/license";
import {
  isFeatureAvailable,
  getRequiredTier,
  getAvailableFeatures,
  getLockedFeatures,
  getFeatureLabel,
} from "../src/licensing/featureGate";
import type { FeatureId } from "../src/licensing/featureGate";
import { createProLockBadge, UPGRADE_PROMPT_STYLES } from "../src/content/ui/upgradePrompt";

// ── License Storage ──

describe("license storage", () => {
  beforeEach(() => { storedData = {}; });

  it("defaults to free tier", async () => {
    const license = await loadLicense();
    expect(license.tier).toBe("free");
  });

  it("saves and loads license state", async () => {
    await saveLicense({ tier: "pro", licenseKey: "KEY-123", activatedAt: "2026-04-01T00:00:00Z", isLifetime: true });
    const license = await loadLicense();
    expect(license.tier).toBe("pro");
    expect(license.licenseKey).toBe("KEY-123");
    expect(license.isLifetime).toBe(true);
  });

  it("isPro returns false for free tier", async () => {
    expect(await isPro()).toBe(false);
  });

  it("isPro returns true for active pro", async () => {
    await activatePro("KEY-456", undefined, true);
    expect(await isPro()).toBe(true);
  });

  it("isPro returns false for expired license", async () => {
    await saveLicense({
      tier: "pro",
      licenseKey: "KEY-789",
      activatedAt: "2025-01-01T00:00:00Z",
      expiresAt: "2025-12-31T00:00:00Z", // expired
      isLifetime: false,
    });
    expect(await isPro()).toBe(false);
  });

  it("isPro returns true for lifetime even without expiresAt", async () => {
    await saveLicense({
      tier: "pro",
      licenseKey: "KEY-LT",
      activatedAt: "2026-01-01T00:00:00Z",
      isLifetime: true,
    });
    expect(await isPro()).toBe(true);
  });

  it("deactivatePro reverts to free", async () => {
    await activatePro("KEY-123");
    expect(await isPro()).toBe(true);
    await deactivatePro();
    expect(await isPro()).toBe(false);
    const license = await loadLicense();
    expect(license.tier).toBe("free");
  });
});

// ── Feature Gate ──

describe("feature gate", () => {
  it("all premium features require pro tier", () => {
    const premiumFeatures: FeatureId[] = [
      "ml-review-analysis", "deal-scoring", "trust-scores",
      "seller-trust", "listing-integrity", "compare-tray",
      "export", "watchlist", "recall-safety",
    ];
    for (const f of premiumFeatures) {
      expect(getRequiredTier(f)).toBe("pro");
    }
  });

  it("isFeatureAvailable returns false for free user on pro feature", () => {
    expect(isFeatureAvailable("deal-scoring", "free")).toBe(false);
    expect(isFeatureAvailable("export", "free")).toBe(false);
  });

  it("isFeatureAvailable returns true for pro user on pro feature", () => {
    expect(isFeatureAvailable("deal-scoring", "pro")).toBe(true);
    expect(isFeatureAvailable("export", "pro")).toBe(true);
  });

  it("getLockedFeatures returns all features for free tier", () => {
    const locked = getLockedFeatures("free");
    expect(locked.length).toBeGreaterThan(0);
    expect(locked).toContain("deal-scoring");
    expect(locked).toContain("watchlist");
  });

  it("getLockedFeatures returns empty for pro tier", () => {
    expect(getLockedFeatures("pro")).toEqual([]);
  });

  it("getAvailableFeatures for pro includes everything", () => {
    const available = getAvailableFeatures("pro");
    expect(available).toContain("deal-scoring");
    expect(available).toContain("watchlist");
    expect(available).toContain("export");
  });

  it("getFeatureLabel returns human-readable labels", () => {
    expect(getFeatureLabel("deal-scoring")).toBe("Deal Quality Scoring");
    expect(getFeatureLabel("watchlist")).toBe("Price Watchlist & Alerts");
    expect(getFeatureLabel("recall-safety")).toBe("Recall Safety Matching");
  });
});

// ── Upgrade Prompt UI ──

describe("upgrade prompt", () => {
  it("creates a pro lock badge element", () => {
    const badge = createProLockBadge("deal-scoring");
    expect(badge.className).toContain("bas-pro-lock");
    expect(badge.textContent).toContain("Pro");
    expect(badge.getAttribute("role")).toBe("button");
    expect(badge.getAttribute("aria-label")).toContain("Deal Quality Scoring");
  });

  it("has correct title tooltip", () => {
    const badge = createProLockBadge("watchlist");
    expect(badge.title).toContain("Price Watchlist & Alerts");
    expect(badge.title).toContain("Upgrade to Pro");
  });

  it("exports styles", () => {
    expect(UPGRADE_PROMPT_STYLES).toContain("bas-pro-lock");
  });
});
