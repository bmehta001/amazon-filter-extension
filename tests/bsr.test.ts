import { describe, it, expect } from "vitest";
import { extractBsr } from "../src/brand/fetcher";
import { injectConfidenceBadge } from "../src/content/ui/confidenceBadge";
import type { ConfidenceInput } from "../src/content/ui/confidenceBadge";

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("extractBsr", () => {
  it("extracts BSR from product details table", () => {
    const doc = makeDoc(`
      <div id="prodDetails">
        <table>
          <tr><th>Best Sellers Rank</th><td>#247 in Electronics</td></tr>
        </table>
      </div>
    `);
    const result = extractBsr(doc);
    expect(result).not.toBeNull();
    expect(result!.rank).toBe(247);
    expect(result!.category).toBe("Electronics");
  });

  it("extracts BSR with comma-separated rank", () => {
    const doc = makeDoc(`
      <div id="productDetails_detailBullets_sections1">
        <table><tr><th>Best Sellers Rank</th><td>#1,234 in Home &amp; Kitchen</td></tr></table>
      </div>
    `);
    const result = extractBsr(doc);
    expect(result).not.toBeNull();
    expect(result!.rank).toBe(1234);
    expect(result!.category).toBe("Home & Kitchen");
  });

  it("extracts BSR from detail bullets list", () => {
    const doc = makeDoc(`
      <div id="detailBullets_feature_div">
        <span>Best Sellers Rank: #56 in Toys & Games</span>
      </div>
    `);
    const result = extractBsr(doc);
    expect(result).not.toBeNull();
    expect(result!.rank).toBe(56);
    expect(result!.category).toBe("Toys & Games");
  });

  it("extracts BSR from broader page section", () => {
    const doc = makeDoc(`
      <div id="ppd">
        <div>Amazon Best Sellers Rank: #89,012 in Beauty & Personal Care (See Top 100)</div>
      </div>
    `);
    const result = extractBsr(doc);
    expect(result).not.toBeNull();
    expect(result!.rank).toBe(89012);
    expect(result!.category).toBe("Beauty & Personal Care");
  });

  it("returns null when no BSR present", () => {
    const doc = makeDoc(`
      <div id="prodDetails">
        <table><tr><th>Weight</th><td>2 lbs</td></tr></table>
      </div>
    `);
    expect(extractBsr(doc)).toBeNull();
  });

  it("returns null for empty document", () => {
    const doc = makeDoc("<html><body></body></html>");
    expect(extractBsr(doc)).toBeNull();
  });
});

describe("confidence badge with BSR", () => {
  it("includes BSR in tooltip text", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.textContent = "Product Title";
    card.appendChild(h2);

    const input: ConfidenceInput = {
      reviewTrust: {
        score: 85, label: "trustworthy", color: "green",
        signals: [], positiveSignals: [],
        maxPossibleDeduction: 100, totalDeduction: 15,
        sampleSize: 50, computedAt: Date.now(),
      },
      sellerTrust: {
        score: 70, label: "neutral", color: "gray",
        signals: [], summary: "Neutral seller",
      },
      bsr: { rank: 247, category: "Electronics" },
    };

    injectConfidenceBadge(card, input);

    const badge = card.querySelector(".bas-confidence");
    expect(badge).not.toBeNull();
    expect(badge!.getAttribute("title")).toContain("BSR: #247 in Electronics");
  });

  it("shows BSR rank label in badge", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);

    const input: ConfidenceInput = {
      reviewTrust: {
        score: 90, label: "trustworthy", color: "green",
        signals: [], positiveSignals: [],
        maxPossibleDeduction: 100, totalDeduction: 10,
        sampleSize: 30, computedAt: Date.now(),
      },
      sellerTrust: {
        score: 80, label: "trusted", color: "green",
        signals: [], summary: "Trusted",
      },
      bsr: { rank: 5, category: "Books" },
    };

    injectConfidenceBadge(card, input);

    const badge = card.querySelector(".bas-confidence");
    expect(badge!.textContent).toContain("#5");
  });

  it("renders without BSR when not provided", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);

    const input: ConfidenceInput = {
      reviewTrust: {
        score: 85, label: "trustworthy", color: "green",
        signals: [], positiveSignals: [],
        maxPossibleDeduction: 100, totalDeduction: 15,
        sampleSize: 50, computedAt: Date.now(),
      },
      sellerTrust: {
        score: 70, label: "neutral", color: "gray",
        signals: [], summary: "Neutral",
      },
    };

    injectConfidenceBadge(card, input);

    const badge = card.querySelector(".bas-confidence");
    expect(badge).not.toBeNull();
    expect(badge!.getAttribute("title")).not.toContain("BSR");
  });
});
