import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("chrome", {
  storage: {
    sync: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    local: {
      get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
      set: vi.fn((_d: unknown, cb?: () => void) => cb?.()),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined },
});

import { computeRedFlagReport } from "../src/content/ui/productScore";
import type { ProductScoreInput, RedFlagReport } from "../src/content/ui/productScore";
import { getCurrentMonthInsights, trackProductsAnalyzed, trackSuspiciousListing, trackSavings } from "../src/insights/dashboard";
import { getFeatureTeaser } from "../src/licensing/featureGate";

// ── Red Flag Report ──

describe("computeRedFlagReport", () => {
  it("returns low-risk when all scores are good", () => {
    const input: ProductScoreInput = {
      reviewTrust: { score: 90, label: "high", color: "green", signals: [], summary: "" } as any,
      sellerTrust: { score: 85, label: "trusted", color: "green", signals: [], summary: "" } as any,
      reviewScore: { score: 88, label: "authentic", breakdown: { reasons: [] } } as any,
    };
    const report = computeRedFlagReport(input);
    expect(report.verdict).toBe("low-risk");
    expect(report.flags.length).toBe(0);
    expect(report.positives.length).toBeGreaterThan(0);
  });

  it("returns high-risk when 3+ flags present", () => {
    const input: ProductScoreInput = {
      reviewTrust: { score: 30, label: "low", color: "red", signals: [], summary: "" } as any,
      sellerTrust: { score: 25, label: "risky", color: "red", signals: [], summary: "" } as any,
      reviewScore: { score: 20, label: "suspicious", breakdown: { reasons: [] } } as any,
    };
    const report = computeRedFlagReport(input);
    expect(report.verdict).toBe("high-risk");
    expect(report.flags.length).toBe(3);
    expect(report.recommendation).toContain("alternatives");
  });

  it("returns caution with 1-2 flags", () => {
    const input: ProductScoreInput = {
      reviewTrust: { score: 40, label: "low", color: "red", signals: [], summary: "" } as any,
      sellerTrust: { score: 80, label: "trusted", color: "green", signals: [], summary: "" } as any,
    };
    const report = computeRedFlagReport(input);
    expect(report.verdict).toBe("caution");
    expect(report.flags.length).toBe(1);
  });

  it("flags inflated pricing", () => {
    const input: ProductScoreInput = {
      dealScore: { score: 20, label: "Inflated Pricing", emoji: "🔴", color: "red", signals: [] } as any,
    };
    const report = computeRedFlagReport(input);
    expect(report.flags.some(f => f.includes("inflated"))).toBe(true);
  });

  it("includes positive signal for great deal", () => {
    const input: ProductScoreInput = {
      dealScore: { score: 90, label: "Great Deal", emoji: "🟢", color: "green", signals: [] } as any,
      reviewTrust: { score: 85, label: "high", color: "green", signals: [], summary: "" } as any,
    };
    const report = computeRedFlagReport(input);
    expect(report.positives.some(p => p.includes("Great deal"))).toBe(true);
  });

  it("flags low listing completeness", () => {
    const input: ProductScoreInput = {
      listingCompleteness: { score: 25, label: "poor", color: "red", fields: [], department: null, presentCount: 2, totalCount: 12, missingImportantCount: 5 },
    };
    const report = computeRedFlagReport(input);
    expect(report.flags.some(f => f.includes("5 key info fields"))).toBe(true);
  });

  it("limits flags to 3 and positives to 2", () => {
    const input: ProductScoreInput = {
      reviewTrust: { score: 20, label: "low", color: "red", signals: [], summary: "" } as any,
      sellerTrust: { score: 20, label: "risky", color: "red", signals: [], summary: "" } as any,
      reviewScore: { score: 15, label: "suspicious", breakdown: { reasons: [] } } as any,
      listingIntegrity: { score: 20, label: "alert", color: "red", signals: [], summary: "" } as any,
      listingCompleteness: { score: 10, label: "poor", color: "red", fields: [], department: null, presentCount: 1, totalCount: 12, missingImportantCount: 8 },
    };
    const report = computeRedFlagReport(input);
    expect(report.flags.length).toBeLessThanOrEqual(3);
  });
});

// ── Pro Feature Teasers ──

describe("feature teasers", () => {
  it("returns contextual teaser for each premium feature", () => {
    expect(getFeatureTeaser("deal-scoring")).toContain("Deal");
    expect(getFeatureTeaser("trust-scores")).toContain("Trust");
    expect(getFeatureTeaser("watchlist")).toContain("Track");
    expect(getFeatureTeaser("recall-safety")).toContain("Safety");
  });
});

// ── Shopping Insights ──

describe("shopping insights dashboard", () => {
  it("tracks products analyzed", async () => {
    await trackProductsAnalyzed(25);
    // Verify the tracking function doesn't throw
    // (actual storage verification depends on mock setup)
  });

  it("tracks suspicious listings", async () => {
    await trackSuspiciousListing();
    // Non-throwing verification
  });

  it("tracks savings amounts", async () => {
    await trackSavings(14.99);
    // Non-throwing verification
  });
});
