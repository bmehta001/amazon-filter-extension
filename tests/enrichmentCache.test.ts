import { describe, it, expect, beforeEach, vi } from "vitest";

// ── chrome.storage.session mock ──
let sessionData: Record<string, unknown> = {};

vi.stubGlobal("chrome", {
  storage: {
    session: {
      get(keys: string | string[], cb: (result: Record<string, unknown>) => void) {
        const keyArr = typeof keys === "string" ? [keys] : keys;
        const result: Record<string, unknown> = {};
        for (const k of keyArr) {
          if (k in sessionData) result[k] = sessionData[k];
        }
        cb(result);
      },
      set(data: Record<string, unknown>, cb?: () => void) {
        Object.assign(sessionData, data);
        cb?.();
      },
      remove(keys: string | string[], cb?: () => void) {
        const keyArr = typeof keys === "string" ? [keys] : keys;
        for (const k of keyArr) delete sessionData[k];
        cb?.();
      },
    },
    sync: {
      get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
      set: vi.fn((_d: unknown, cb?: () => void) => cb?.()),
    },
    local: {
      get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
      set: vi.fn((_d: unknown, cb?: () => void) => cb?.()),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined },
});

import {
  saveMapToCache,
  loadMapFromCache,
  saveAllEnrichment,
  restoreAllEnrichment,
  clearEnrichmentCache,
  preloadSessionCache,
} from "../src/util/enrichmentCache";

/** Helper: save then preload then load (simulates the real flow). */
async function saveAndReload<T>(key: string, map: Map<string, T>): Promise<Map<string, T>> {
  saveMapToCache(key, map);
  await preloadSessionCache();
  return loadMapFromCache<T>(key);
}

describe("enrichmentCache", () => {
  beforeEach(async () => {
    sessionData = {};
    await preloadSessionCache();
  });

  describe("saveMapToCache / loadMapFromCache", () => {
    it("round-trips a Map<string, string>", async () => {
      const original = new Map([["A1", "BrandX"], ["A2", "BrandY"]]);
      const restored = await saveAndReload("brandMap", original);
      expect(restored.size).toBe(2);
      expect(restored.get("A1")).toBe("BrandX");
      expect(restored.get("A2")).toBe("BrandY");
    });

    it("round-trips a Map<string, number>", async () => {
      const original = new Map([["A1", 85], ["A2", 42]]);
      const restored = await saveAndReload("dealScoreExportMap", original);
      expect(restored.get("A1")).toBe(85);
    });

    it("round-trips complex objects", async () => {
      const data = { score: 78, label: "mixed" as const, signals: ["sig1"] };
      const original = new Map([["A1", data]]);
      const restored = await saveAndReload("trustScoreMap", original);
      expect(restored.get("A1")).toEqual(data);
    });

    it("returns empty Map for missing key", () => {
      const result = loadMapFromCache<string>("nonexistent");
      expect(result.size).toBe(0);
    });

    it("skips saving empty maps", () => {
      saveMapToCache("brandMap", new Map());
      expect(sessionData["bas-ec-brandMap"]).toBeUndefined();
    });

    it("expires entries past TTL", async () => {
      const original = new Map([["A1", "old"]]);
      saveMapToCache("brandMap", original);

      // Manually backdate the timestamp
      const entry = sessionData["bas-ec-brandMap"] as { ts: number };
      entry.ts = Date.now() - 31 * 60 * 1000; // 31 minutes ago

      await preloadSessionCache();
      const restored = loadMapFromCache<string>("brandMap");
      expect(restored.size).toBe(0);
    });

    it("handles corrupted data gracefully", async () => {
      // Write a non-object value directly
      sessionData["bas-ec-brandMap"] = "not-valid-entry";
      await preloadSessionCache();
      const restored = loadMapFromCache<string>("brandMap");
      expect(restored.size).toBe(0);
    });

    it("trims maps exceeding 1000 entries", async () => {
      const large = new Map<string, string>();
      for (let i = 0; i < 1100; i++) {
        large.set(`ASIN${i}`, `Brand${i}`);
      }
      const restored = await saveAndReload("brandMap", large);
      expect(restored.size).toBe(1000);
      // Should keep the last 1000 (most recent)
      expect(restored.has("ASIN100")).toBe(true);
      expect(restored.has("ASIN1099")).toBe(true);
    });

    it("handles storage error gracefully without crashing", () => {
      // Should not throw even if storage is unavailable
      const data = new Map([["A1", "fresh"]]);
      expect(() => saveMapToCache("brandMap", data)).not.toThrow();
    });
  });

  describe("saveAllEnrichment / restoreAllEnrichment", () => {
    it("round-trips all maps", async () => {
      const maps = {
        reviewScoreMap: new Map([["A1", { score: 80, label: "authentic" as const, breakdown: {} as any, computedAt: 1 }]]),
        productInsightsMap: new Map([["A1", { adjustedRating: 4.2 } as any]]),
        reviewDataMap: new Map([["A1", { asin: "A1", histogram: null, reviews: [], totalRatings: 10, averageRating: 4.0 }]]),
        brandMap: new Map([["A1", "TestBrand"]]),
        sellerMap: new Map([["A1", { sellerName: "TestSeller", fulfillment: "FBA" as any }]]),
        originMap: new Map([["A1", "US"]]),
        trustScoreMap: new Map([["A1", { score: 90 } as any]]),
        sellerTrustMap: new Map([["A1", { score: 75 } as any]]),
        listingIntegrityMap: new Map([["A1", { score: 95 } as any]]),
        dealScoreExportMap: new Map([["A1", 67]]),
        reviewSummaryMap: new Map([["A1", { pros: [], cons: [], oneLiner: "Great!" }]]),
        multiBuyMap: new Map([["A1", { text: "Buy 2, save 10%", minQuantity: 2 }]]),
        bsrMap: new Map([["A1", { rank: 247, category: "Electronics" }]]),
        reviewMediaMap: new Map([["A1", { items: [{ url: "https://img.com/full.jpg", thumbnailUrl: "https://img.com/thumb.jpg", type: "image" as const, reviewRating: 5, verified: true }], reviewsWithMedia: 1 }]]),
        listingCompletenessMap: new Map([["A1", { score: 75, label: "good" as const, color: "gray" as const, fields: [], department: null, presentCount: 8, totalCount: 12, missingImportantCount: 2 }]]),
      };

      saveAllEnrichment(maps);

      // Preload cache snapshot then restore
      await preloadSessionCache();
      const restored = restoreAllEnrichment();

      expect(restored.reviewScoreMap.get("A1")?.score).toBe(80);
      expect(restored.brandMap.get("A1")).toBe("TestBrand");
      expect(restored.sellerMap.get("A1")?.sellerName).toBe("TestSeller");
      expect(restored.originMap.get("A1")).toBe("US");
      expect(restored.dealScoreExportMap.get("A1")).toBe(67);
      expect(restored.reviewSummaryMap.get("A1")?.oneLiner).toBe("Great!");
      expect(restored.reviewDataMap.get("A1")?.asin).toBe("A1");
      expect(restored.trustScoreMap.get("A1")?.score).toBe(90);
      expect(restored.sellerTrustMap.get("A1")?.score).toBe(75);
      expect(restored.listingIntegrityMap.get("A1")?.score).toBe(95);
      expect(restored.productInsightsMap.get("A1")?.adjustedRating).toBe(4.2);
      expect(restored.multiBuyMap.get("A1")?.text).toBe("Buy 2, save 10%");
      expect(restored.bsrMap.get("A1")?.rank).toBe(247);
      expect(restored.bsrMap.get("A1")?.category).toBe("Electronics");
      expect(restored.reviewMediaMap.get("A1")?.items.length).toBe(1);
      expect(restored.reviewMediaMap.get("A1")?.items[0].verified).toBe(true);
      expect(restored.listingCompletenessMap.get("A1")?.score).toBe(75);
    });

    it("returns empty maps when nothing is cached", () => {
      const restored = restoreAllEnrichment();
      expect(restored.reviewScoreMap.size).toBe(0);
      expect(restored.brandMap.size).toBe(0);
      expect(restored.dealScoreExportMap.size).toBe(0);
    });
  });

  describe("clearEnrichmentCache", () => {
    it("removes all bas-ec-* entries", async () => {
      saveMapToCache("brandMap", new Map([["A1", "X"]]));
      saveMapToCache("originMap", new Map([["A1", "US"]]));
      expect(Object.keys(sessionData).length).toBeGreaterThanOrEqual(2);

      clearEnrichmentCache();

      expect(sessionData["bas-ec-brandMap"]).toBeUndefined();
      expect(sessionData["bas-ec-originMap"]).toBeUndefined();
    });
  });
});
