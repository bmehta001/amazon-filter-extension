import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveMapToCache,
  loadMapFromCache,
  saveAllEnrichment,
  restoreAllEnrichment,
  clearEnrichmentCache,
} from "../src/util/enrichmentCache";

describe("enrichmentCache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe("saveMapToCache / loadMapFromCache", () => {
    it("round-trips a Map<string, string>", () => {
      const original = new Map([["A1", "BrandX"], ["A2", "BrandY"]]);
      saveMapToCache("brandMap", original);
      const restored = loadMapFromCache<string>("brandMap");
      expect(restored.size).toBe(2);
      expect(restored.get("A1")).toBe("BrandX");
      expect(restored.get("A2")).toBe("BrandY");
    });

    it("round-trips a Map<string, number>", () => {
      const original = new Map([["A1", 85], ["A2", 42]]);
      saveMapToCache("dealScoreExportMap", original);
      const restored = loadMapFromCache<number>("dealScoreExportMap");
      expect(restored.get("A1")).toBe(85);
    });

    it("round-trips complex objects", () => {
      const data = { score: 78, label: "mixed" as const, signals: ["sig1"] };
      const original = new Map([["A1", data]]);
      saveMapToCache("trustScoreMap", original);
      const restored = loadMapFromCache<typeof data>("trustScoreMap");
      expect(restored.get("A1")).toEqual(data);
    });

    it("returns empty Map for missing key", () => {
      const result = loadMapFromCache<string>("nonexistent");
      expect(result.size).toBe(0);
    });

    it("skips saving empty maps", () => {
      saveMapToCache("brandMap", new Map());
      expect(sessionStorage.getItem("bas-ec-brandMap")).toBeNull();
    });

    it("expires entries past TTL", () => {
      const original = new Map([["A1", "old"]]);
      saveMapToCache("brandMap", original);

      // Manually backdate the timestamp
      const raw = sessionStorage.getItem("bas-ec-brandMap")!;
      const entry = JSON.parse(raw);
      entry.ts = Date.now() - 31 * 60 * 1000; // 31 minutes ago
      sessionStorage.setItem("bas-ec-brandMap", JSON.stringify(entry));

      const restored = loadMapFromCache<string>("brandMap");
      expect(restored.size).toBe(0);
      expect(sessionStorage.getItem("bas-ec-brandMap")).toBeNull();
    });

    it("handles corrupted JSON gracefully", () => {
      sessionStorage.setItem("bas-ec-brandMap", "not-json{{{");
      const restored = loadMapFromCache<string>("brandMap");
      expect(restored.size).toBe(0);
      // Corrupted entry should be removed
      expect(sessionStorage.getItem("bas-ec-brandMap")).toBeNull();
    });

    it("trims maps exceeding 1000 entries", () => {
      const large = new Map<string, string>();
      for (let i = 0; i < 1100; i++) {
        large.set(`ASIN${i}`, `Brand${i}`);
      }
      saveMapToCache("brandMap", large);
      const restored = loadMapFromCache<string>("brandMap");
      expect(restored.size).toBe(1000);
      // Should keep the last 1000 (most recent)
      expect(restored.has("ASIN100")).toBe(true);
      expect(restored.has("ASIN1099")).toBe(true);
    });

    it("handles quota exceeded gracefully without crashing", () => {
      // Mock setItem to always fail (simulates full storage)
      vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });

      const data = new Map([["A1", "fresh"]]);
      // Should not throw
      expect(() => saveMapToCache("brandMap", data)).not.toThrow();

      vi.restoreAllMocks();
    });
  });

  describe("saveAllEnrichment / restoreAllEnrichment", () => {
    it("round-trips all 11 maps", () => {
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
      };

      saveAllEnrichment(maps);

      // Clear in-memory to prove we're reading from storage
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
    });

    it("returns empty maps when nothing is cached", () => {
      const restored = restoreAllEnrichment();
      expect(restored.reviewScoreMap.size).toBe(0);
      expect(restored.brandMap.size).toBe(0);
      expect(restored.dealScoreExportMap.size).toBe(0);
    });
  });

  describe("clearEnrichmentCache", () => {
    it("removes all bas-ec-* entries", () => {
      saveMapToCache("brandMap", new Map([["A1", "X"]]));
      saveMapToCache("originMap", new Map([["A1", "US"]]));
      expect(sessionStorage.length).toBeGreaterThanOrEqual(2);

      clearEnrichmentCache();

      expect(sessionStorage.getItem("bas-ec-brandMap")).toBeNull();
      expect(sessionStorage.getItem("bas-ec-originMap")).toBeNull();
    });

    it("does not remove non-cache sessionStorage keys", () => {
      sessionStorage.setItem("other-key", "value");
      saveMapToCache("brandMap", new Map([["A1", "X"]]));

      clearEnrichmentCache();

      expect(sessionStorage.getItem("other-key")).toBe("value");
    });
  });
});
