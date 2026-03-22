import { describe, it, expect } from "vitest";
import {
  buildAdvancedSearchUrl,
  parseAdvancedOptions,
  DEFAULT_ADVANCED_OPTIONS,
  DEPARTMENTS,
  CONDITIONS,
  STAR_RATINGS,
  SORT_OPTIONS,
  AMAZON_SELLER_ID,
} from "../src/util/amazonParams";
import type { AdvancedSearchOptions } from "../src/util/amazonParams";

const BASE = "https://www.amazon.com/s?k=headphones";

describe("amazonParams", () => {
  // ── Data definitions ────────────────────────────────────────────────

  it("defines departments with nodeId and label", () => {
    expect(DEPARTMENTS.length).toBeGreaterThan(15);
    for (const d of DEPARTMENTS) {
      expect(typeof d.label).toBe("string");
      expect(typeof d.nodeId).toBe("string");
    }
    // "All Departments" has empty nodeId
    expect(DEPARTMENTS[0]).toEqual({ label: "All Departments", nodeId: "" });
  });

  it("defines conditions", () => {
    expect(CONDITIONS.length).toBe(4);
    const labels = CONDITIONS.map((c) => c.label);
    expect(labels).toContain("New");
    expect(labels).toContain("Used");
  });

  it("defines star ratings", () => {
    expect(STAR_RATINGS.length).toBe(4);
    expect(STAR_RATINGS[0]).toEqual({ label: "4★ & Up", value: "4" });
  });

  it("defines sort options", () => {
    expect(SORT_OPTIONS.length).toBeGreaterThan(3);
    expect(SORT_OPTIONS[0].value).toBe(""); // Featured = default
  });

  // ── buildAdvancedSearchUrl ──────────────────────────────────────────

  describe("buildAdvancedSearchUrl", () => {
    it("returns clean /s path with query", () => {
      const url = buildAdvancedSearchUrl("headphones", DEFAULT_ADVANCED_OPTIONS, BASE);
      const parsed = new URL(url);
      expect(parsed.pathname).toBe("/s");
      expect(parsed.searchParams.get("k")).toBe("headphones");
    });

    it("adds exclude words with - prefix", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        excludeWords: ["cheap", "knockoff"],
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      expect(new URL(url).searchParams.get("k")).toBe("headphones -cheap -knockoff");
    });

    it("quotes multi-word exclusions", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        excludeWords: ["for kids"],
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      expect(new URL(url).searchParams.get("k")).toContain('-"for kids"');
    });

    it("does not duplicate existing exclusions", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        excludeWords: ["cheap"],
      };
      const url = buildAdvancedSearchUrl("headphones -cheap", opts, BASE);
      const query = new URL(url).searchParams.get("k")!;
      // Should not have -cheap twice
      const count = (query.match(/-cheap/g) ?? []).length;
      expect(count).toBe(1);
    });

    it("adds department via rh param", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        department: "172282", // Electronics
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      expect(new URL(url).searchParams.get("rh")).toBe("n:172282");
    });

    it("combines department + stars + condition in rh", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        department: "172282",
        minStars: "4",
        condition: "New",
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      const rh = new URL(url).searchParams.get("rh")!;
      expect(rh).toContain("n:172282");
      expect(rh).toContain("p_72:2661618011"); // 4★ node ID
      expect(rh).toContain("p_n_condition-type:New");
    });

    it("sets stars via rh without department", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        minStars: "3",
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      expect(new URL(url).searchParams.get("rh")).toBe("p_72:2661617011");
    });

    it("sets Prime-only via p_85", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        primeOnly: true,
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      expect(new URL(url).searchParams.get("p_85")).toBe("2470955011");
    });

    it("removes p_85 when Prime is off", () => {
      const baseWithPrime = BASE + "&p_85=2470955011";
      const url = buildAdvancedSearchUrl("headphones", DEFAULT_ADVANCED_OPTIONS, baseWithPrime);
      expect(new URL(url).searchParams.has("p_85")).toBe(false);
    });

    it("sets price range in cents via p_36", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        priceMin: 10,
        priceMax: 50,
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      expect(new URL(url).searchParams.get("p_36")).toBe("1000-5000");
    });

    it("handles open-ended price min", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        priceMin: 25,
        priceMax: null,
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      expect(new URL(url).searchParams.get("p_36")).toBe("2500-");
    });

    it("handles open-ended price max", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        priceMin: null,
        priceMax: 100,
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      expect(new URL(url).searchParams.get("p_36")).toBe("-10000");
    });

    it("removes p_36 when no price constraints", () => {
      const baseWithPrice = BASE + "&p_36=1000-5000";
      const url = buildAdvancedSearchUrl("headphones", DEFAULT_ADVANCED_OPTIONS, baseWithPrice);
      expect(new URL(url).searchParams.has("p_36")).toBe(false);
    });

    it("sets sort via s param", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        sort: "price-asc-rank",
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      expect(new URL(url).searchParams.get("s")).toBe("price-asc-rank");
    });

    it("removes sort when default", () => {
      const baseWithSort = BASE + "&s=price-asc-rank";
      const url = buildAdvancedSearchUrl("headphones", DEFAULT_ADVANCED_OPTIONS, baseWithSort);
      expect(new URL(url).searchParams.has("s")).toBe(false);
    });

    it("sets Amazon-only via emi", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        amazonOnly: true,
      };
      const url = buildAdvancedSearchUrl("headphones", opts, BASE);
      expect(new URL(url).searchParams.get("emi")).toBe(AMAZON_SELLER_ID);
    });

    it("strips stale pagination params", () => {
      const baseWithPage = BASE + "&page=3&qid=123&ref=abc";
      const url = buildAdvancedSearchUrl("headphones", DEFAULT_ADVANCED_OPTIONS, baseWithPage);
      const parsed = new URL(url);
      expect(parsed.searchParams.has("page")).toBe(false);
      expect(parsed.searchParams.has("qid")).toBe(false);
      expect(parsed.searchParams.has("ref")).toBe(false);
    });

    it("combines all options", () => {
      const opts: AdvancedSearchOptions = {
        excludeWords: ["cheap"],
        department: "172282",
        minStars: "4",
        condition: "New",
        primeOnly: true,
        priceMin: 20,
        priceMax: 200,
        sort: "review-count-rank",
        amazonOnly: true,
      };
      const url = buildAdvancedSearchUrl("wireless headphones", opts, BASE);
      const parsed = new URL(url);
      expect(parsed.searchParams.get("k")).toContain("wireless headphones");
      expect(parsed.searchParams.get("k")).toContain("-cheap");
      expect(parsed.searchParams.get("rh")).toContain("n:172282");
      expect(parsed.searchParams.get("p_85")).toBe("2470955011");
      expect(parsed.searchParams.get("p_36")).toBe("2000-20000");
      expect(parsed.searchParams.get("s")).toBe("review-count-rank");
      expect(parsed.searchParams.get("emi")).toBe(AMAZON_SELLER_ID);
    });

    it("returns base URL on invalid input", () => {
      const result = buildAdvancedSearchUrl("test", DEFAULT_ADVANCED_OPTIONS, "not-a-url");
      expect(result).toBe("not-a-url");
    });

    it("handles empty query gracefully", () => {
      const url = buildAdvancedSearchUrl("", DEFAULT_ADVANCED_OPTIONS, BASE);
      const parsed = new URL(url);
      expect(parsed.searchParams.get("k")).toBe("");
    });

    it("handles decimal prices", () => {
      const opts: AdvancedSearchOptions = {
        ...DEFAULT_ADVANCED_OPTIONS,
        priceMin: 9.99,
        priceMax: 49.99,
      };
      const url = buildAdvancedSearchUrl("test", opts, BASE);
      expect(new URL(url).searchParams.get("p_36")).toBe("999-4999");
    });
  });

  // ── parseAdvancedOptions ──────────────────────────────────────────

  describe("parseAdvancedOptions", () => {
    it("extracts exclude words from query", () => {
      const result = parseAdvancedOptions("https://www.amazon.com/s?k=headphones+-cheap+-knockoff");
      expect(result.excludeWords).toEqual(["cheap", "knockoff"]);
    });

    it("extracts quoted multi-word exclusions", () => {
      const result = parseAdvancedOptions('https://www.amazon.com/s?k=headphones+-"for+kids"');
      expect(result.excludeWords).toContain("for kids");
    });

    it("detects Prime filter", () => {
      const result = parseAdvancedOptions("https://www.amazon.com/s?k=headphones&p_85=2470955011");
      expect(result.primeOnly).toBe(true);
    });

    it("detects Amazon-only seller", () => {
      const result = parseAdvancedOptions(`https://www.amazon.com/s?k=test&emi=${AMAZON_SELLER_ID}`);
      expect(result.amazonOnly).toBe(true);
    });

    it("does not flag non-Amazon emi as amazonOnly", () => {
      const result = parseAdvancedOptions("https://www.amazon.com/s?k=test&emi=SOMESELLER");
      expect(result.amazonOnly).toBeUndefined();
    });

    it("extracts sort option", () => {
      const result = parseAdvancedOptions("https://www.amazon.com/s?k=test&s=price-asc-rank");
      expect(result.sort).toBe("price-asc-rank");
    });

    it("extracts price range in dollars", () => {
      const result = parseAdvancedOptions("https://www.amazon.com/s?k=test&p_36=2000-10000");
      expect(result.priceMin).toBe(20);
      expect(result.priceMax).toBe(100);
    });

    it("handles open-ended price min", () => {
      const result = parseAdvancedOptions("https://www.amazon.com/s?k=test&p_36=5000-");
      expect(result.priceMin).toBe(50);
      expect(result.priceMax).toBeUndefined();
    });

    it("returns empty object for plain URL", () => {
      const result = parseAdvancedOptions("https://www.amazon.com/s?k=headphones");
      expect(result).toEqual({});
    });

    it("returns empty object for invalid URL", () => {
      const result = parseAdvancedOptions("not-a-url");
      expect(result).toEqual({});
    });
  });
});
