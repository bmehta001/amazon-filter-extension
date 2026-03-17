import { describe, it, expect } from "vitest";
import {
  DEFAULT_PREFERENCES,
  applyBandwidthPreset,
} from "../src/types";
import type { GlobalPreferences, BandwidthPreset } from "../src/types";

describe("GlobalPreferences defaults", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_PREFERENCES.bandwidthMode).toBe("balanced");
    expect(DEFAULT_PREFERENCES.showSparklines).toBe(true);
    expect(DEFAULT_PREFERENCES.showReviewBadges).toBe(true);
    expect(DEFAULT_PREFERENCES.showDealBadges).toBe(true);
    expect(DEFAULT_PREFERENCES.preloadDetails).toBe(true);
    expect(DEFAULT_PREFERENCES.useMLAnalysis).toBe(false);
    expect(DEFAULT_PREFERENCES.hideSponsoredDefault).toBe(false);
    expect(DEFAULT_PREFERENCES.defaultBrandMode).toBe("off");
    expect(DEFAULT_PREFERENCES.defaultSellerFilter).toBe("any");
  });
});

describe("applyBandwidthPreset", () => {
  const base: GlobalPreferences = { ...DEFAULT_PREFERENCES };

  it("high preset enables all data features including ML", () => {
    const result = applyBandwidthPreset(base, "high");
    expect(result.bandwidthMode).toBe("high");
    expect(result.showSparklines).toBe(true);
    expect(result.showReviewBadges).toBe(true);
    expect(result.showDealBadges).toBe(true);
    expect(result.preloadDetails).toBe(true);
    expect(result.useMLAnalysis).toBe(true);
  });

  it("low preset disables all data features", () => {
    const result = applyBandwidthPreset(base, "low");
    expect(result.bandwidthMode).toBe("low");
    expect(result.showSparklines).toBe(false);
    expect(result.showReviewBadges).toBe(false);
    expect(result.showDealBadges).toBe(false);
    expect(result.preloadDetails).toBe(false);
    expect(result.useMLAnalysis).toBe(false);
  });

  it("balanced preset enables features except ML", () => {
    const result = applyBandwidthPreset(base, "balanced");
    expect(result.bandwidthMode).toBe("balanced");
    expect(result.showSparklines).toBe(true);
    expect(result.showReviewBadges).toBe(true);
    expect(result.showDealBadges).toBe(true);
    expect(result.preloadDetails).toBe(true);
    expect(result.useMLAnalysis).toBe(false);
  });

  it("preserves non-bandwidth preferences (e.g., hideSponsoredDefault)", () => {
    const custom: GlobalPreferences = {
      ...base,
      hideSponsoredDefault: true,
      defaultBrandMode: "dim",
      defaultSellerFilter: "amazon",
    };
    const result = applyBandwidthPreset(custom, "high");
    expect(result.hideSponsoredDefault).toBe(true);
    expect(result.defaultBrandMode).toBe("dim");
    expect(result.defaultSellerFilter).toBe("amazon");
  });

  it("round-trips: low → high restores features", () => {
    const low = applyBandwidthPreset(base, "low");
    expect(low.showSparklines).toBe(false);
    const high = applyBandwidthPreset(low, "high");
    expect(high.showSparklines).toBe(true);
    expect(high.useMLAnalysis).toBe(true);
  });

  it("round-trips: high → balanced disables ML only", () => {
    const high = applyBandwidthPreset(base, "high");
    const balanced = applyBandwidthPreset(high, "balanced");
    expect(balanced.showSparklines).toBe(true);
    expect(balanced.useMLAnalysis).toBe(false);
  });
});
