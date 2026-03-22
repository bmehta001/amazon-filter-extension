import { describe, it, expect, beforeEach } from "vitest";
import { injectSummaryPanel, removeSummaryPanel } from "../src/content/ui/reviewSummaryPanel";
import type { SummaryPanelData } from "../src/content/ui/reviewSummaryPanel";
import type { ReviewSummary, ReviewAspect } from "../src/review/summary";
import type { ProductInsights, CategorizedReview, CategorySummary, TopicScore } from "../src/review/types";

function makeAspect(overrides: Partial<ReviewAspect> = {}): ReviewAspect {
  return {
    label: "sound quality",
    mentions: 8,
    avgRating: 4.5,
    sentiment: "positive",
    ...overrides,
  };
}

function makeSummary(overrides: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    pros: [
      makeAspect({ label: "sound quality", avgRating: 4.6, mentions: 8 }),
      makeAspect({ label: "comfort", avgRating: 4.2, mentions: 5 }),
    ],
    cons: [
      makeAspect({ label: "battery life", avgRating: 2.8, mentions: 4, sentiment: "negative" }),
    ],
    oneLiner: "👍 sound quality, comfort  ·  👎 battery life",
    ...overrides,
  };
}

function makeInsights(overrides: Partial<ProductInsights> = {}): ProductInsights {
  return {
    categorySummaries: [
      {
        categoryId: "performance",
        count: 8,
        percentage: 40,
        avgRating: 4.5,
        sampleSnippet: "The sound quality is excellent and the bass is deep",
      },
    ] as CategorySummary[],
    categorizedReviews: [
      {
        review: { text: "Amazing sound quality, love the deep bass and clear treble", rating: 5, date: new Date("2024-01-01"), verified: true, helpfulVotes: 3 },
        categories: ["performance"],
        primaryCategory: "performance",
        sentences: [
          { text: "Amazing sound quality, love the deep bass and clear treble", categories: ["performance"], weight: 1 },
        ],
        impliedRating: null,
      },
    ] as CategorizedReview[],
    adjustedRating: 4.3,
    adjustedReviewCount: 20,
    topicScores: [] as TopicScore[],
    trendWindows: [],
    ...overrides,
  };
}

function makeCard(): HTMLElement {
  const card = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = "Product Title";
  card.appendChild(h2);
  return card;
}

describe("injectSummaryPanel", () => {
  let card: HTMLElement;

  beforeEach(() => {
    card = makeCard();
  });

  it("injects a one-liner and hidden panel", () => {
    const data: SummaryPanelData = { summary: makeSummary() };
    injectSummaryPanel(card, data);

    const oneLiner = card.querySelector(".bas-review-summary");
    expect(oneLiner).toBeTruthy();
    expect(oneLiner?.textContent).toContain("sound quality");

    const panel = card.querySelector(".bas-summary-panel");
    expect(panel).toBeTruthy();
    expect(panel?.classList.contains("bas-summary-panel--open")).toBe(false);
  });

  it("expands panel on click", () => {
    injectSummaryPanel(card, { summary: makeSummary() });

    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();

    const panel = card.querySelector(".bas-summary-panel");
    expect(panel?.classList.contains("bas-summary-panel--open")).toBe(true);
    expect(oneLiner.classList.contains("bas-review-summary--expanded")).toBe(true);
  });

  it("collapses panel on second click", () => {
    injectSummaryPanel(card, { summary: makeSummary() });

    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click(); // expand
    oneLiner.click(); // collapse

    const panel = card.querySelector(".bas-summary-panel");
    expect(panel?.classList.contains("bas-summary-panel--open")).toBe(false);
  });

  it("shows pros section with aspect rows", () => {
    injectSummaryPanel(card, { summary: makeSummary() });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();

    const headings = card.querySelectorAll(".bas-sp-heading");
    const headingTexts = Array.from(headings).map((h) => h.textContent);
    expect(headingTexts).toContain("👍 What customers love");

    const aspectLabels = card.querySelectorAll(".bas-sp-aspect__label");
    const labels = Array.from(aspectLabels).map((l) => l.textContent);
    expect(labels).toContain("sound quality");
    expect(labels).toContain("comfort");
  });

  it("shows cons section", () => {
    injectSummaryPanel(card, { summary: makeSummary() });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();

    const headings = card.querySelectorAll(".bas-sp-heading");
    const headingTexts = Array.from(headings).map((h) => h.textContent);
    expect(headingTexts).toContain("👎 Common complaints");

    const labels = Array.from(card.querySelectorAll(".bas-sp-aspect__label")).map((l) => l.textContent);
    expect(labels).toContain("battery life");
  });

  it("shows rating bars with correct tiers", () => {
    injectSummaryPanel(card, { summary: makeSummary() });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();

    const ratings = card.querySelectorAll(".bas-sp-aspect__rating");
    expect(ratings[0]?.classList.contains("bas-sp-aspect__rating--high")).toBe(true); // 4.6
    expect(ratings[2]?.classList.contains("bas-sp-aspect__rating--low")).toBe(true); // 2.8
  });

  it("shows mention counts", () => {
    injectSummaryPanel(card, { summary: makeSummary() });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();

    const metas = card.querySelectorAll(".bas-sp-aspect__meta");
    expect(metas[0]?.textContent).toBe("8×");
  });

  it("shows trend indicators when available", () => {
    const summary = makeSummary({
      pros: [makeAspect({ trend: "rising" }), makeAspect({ label: "comfort", trend: "falling" })],
    });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();

    const trends = card.querySelectorAll(".bas-sp-aspect__trend");
    expect(trends).toHaveLength(2);
    expect(trends[0]?.textContent).toBe("📈");
    expect(trends[1]?.textContent).toBe("📉");
  });

  it("shows representative quotes when insights provided", () => {
    const insights = makeInsights();
    injectSummaryPanel(card, { summary: makeSummary(), insights });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();

    const quotes = card.querySelectorAll(".bas-sp-quote");
    expect(quotes.length).toBeGreaterThan(0);
  });

  it("shows sentiment bar", () => {
    injectSummaryPanel(card, { summary: makeSummary() });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();

    const sentBar = card.querySelector(".bas-sp-sentiment");
    expect(sentBar).toBeTruthy();
    const posFill = card.querySelector(".bas-sp-sentiment__pos") as HTMLElement;
    expect(posFill).toBeTruthy();
  });

  it("is idempotent — replaces existing panel", () => {
    injectSummaryPanel(card, { summary: makeSummary() });
    injectSummaryPanel(card, { summary: makeSummary() });

    const summaries = card.querySelectorAll(".bas-review-summary");
    expect(summaries).toHaveLength(1);
    const panels = card.querySelectorAll(".bas-summary-panel");
    expect(panels).toHaveLength(1);
  });

  it("skips if no oneLiner", () => {
    const summary = makeSummary({ oneLiner: "" });
    injectSummaryPanel(card, { summary });
    expect(card.querySelector(".bas-review-summary")).toBeNull();
  });

  it("handles summary with only pros (no cons)", () => {
    const summary = makeSummary({ cons: [] });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();

    const headings = card.querySelectorAll(".bas-sp-heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toContain("love");
  });

  it("handles summary with only cons (no pros)", () => {
    const summary = makeSummary({
      pros: [],
      oneLiner: "👎 battery life",
    });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();

    const headings = card.querySelectorAll(".bas-sp-heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toContain("complaints");
  });
});

describe("removeSummaryPanel", () => {
  it("removes both one-liner and panel", () => {
    const card = makeCard();
    injectSummaryPanel(card, { summary: makeSummary() });
    expect(card.querySelector(".bas-review-summary")).toBeTruthy();
    expect(card.querySelector(".bas-summary-panel")).toBeTruthy();

    removeSummaryPanel(card);
    expect(card.querySelector(".bas-review-summary")).toBeNull();
    expect(card.querySelector(".bas-summary-panel")).toBeNull();
  });

  it("is safe when no panel exists", () => {
    const card = makeCard();
    expect(() => removeSummaryPanel(card)).not.toThrow();
  });
});

// ── Edge case tests ─────────────────────────────────────────────────

describe("summaryPanel edge cases", () => {
  it("renders mid-tier rating (3.0 exactly)", () => {
    const card = makeCard();
    const summary = makeSummary({
      pros: [makeAspect({ label: "build quality", avgRating: 3.0, mentions: 3 })],
      cons: [],
    });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const rating = card.querySelector(".bas-sp-aspect__rating");
    expect(rating?.classList.contains("bas-sp-aspect__rating--mid")).toBe(true);
    expect(rating?.textContent).toBe("3.0★");
  });

  it("renders high-tier rating (4.0 exactly)", () => {
    const card = makeCard();
    const summary = makeSummary({
      pros: [makeAspect({ avgRating: 4.0 })],
      cons: [],
    });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const rating = card.querySelector(".bas-sp-aspect__rating");
    expect(rating?.classList.contains("bas-sp-aspect__rating--high")).toBe(true);
  });

  it("renders low-tier rating (2.9)", () => {
    const card = makeCard();
    const summary = makeSummary({
      pros: [],
      cons: [makeAspect({ avgRating: 2.9, sentiment: "negative" })],
      oneLiner: "👎 sound quality",
    });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const rating = card.querySelector(".bas-sp-aspect__rating");
    expect(rating?.classList.contains("bas-sp-aspect__rating--low")).toBe(true);
  });

  it("renders stable trend indicator", () => {
    const card = makeCard();
    const summary = makeSummary({
      pros: [makeAspect({ trend: "stable" })],
      cons: [],
    });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const trend = card.querySelector(".bas-sp-aspect__trend");
    expect(trend?.textContent).toBe("➡️");
  });

  it("does not render trend when not provided", () => {
    const card = makeCard();
    const summary = makeSummary({
      pros: [makeAspect({ trend: undefined })],
      cons: [],
    });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const trends = card.querySelectorAll(".bas-sp-aspect__trend");
    expect(trends).toHaveLength(0);
  });

  it("no quotes when insights not provided", () => {
    const card = makeCard();
    injectSummaryPanel(card, { summary: makeSummary() });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const quotes = card.querySelectorAll(".bas-sp-quote");
    expect(quotes).toHaveLength(0);
  });

  it("skips short snippet (<=15 chars) and falls back to sentence search", () => {
    const card = makeCard();
    const insights = makeInsights({
      categorySummaries: [
        { categoryId: "performance", count: 5, percentage: 30, avgRating: 4.0, sampleSnippet: "Short" },
      ] as CategorySummary[],
      categorizedReviews: [
        {
          review: { text: "test", rating: 4, date: new Date(), verified: true, helpfulVotes: 0 },
          categories: ["performance"],
          primaryCategory: "performance",
          sentences: [
            { text: "The sound quality is absolutely amazing and crystal clear", categories: ["performance"], weight: 1 },
          ],
          impliedRating: null,
        },
      ] as CategorizedReview[],
    });
    injectSummaryPanel(card, { summary: makeSummary(), insights });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const quotes = card.querySelectorAll(".bas-sp-quote");
    // Should find quote via keyword fallback ("sound")
    expect(quotes.length).toBeGreaterThan(0);
  });

  it("truncates quotes longer than 120 chars", () => {
    const card = makeCard();
    const longSnippet = "A".repeat(150);
    const insights = makeInsights({
      categorySummaries: [
        { categoryId: "performance", count: 5, percentage: 30, avgRating: 4.0, sampleSnippet: longSnippet },
      ] as CategorySummary[],
    });
    injectSummaryPanel(card, { summary: makeSummary(), insights });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const quote = card.querySelector(".bas-sp-quote");
    // Includes quotes: "...", so text content length > raw text
    // The raw text inside should be ≤ 120 + "…"
    expect(quote).toBeTruthy();
    const rawText = quote!.textContent!.replace(/^"|"$/g, "");
    expect(rawText.length).toBeLessThanOrEqual(122); // 120 + "…" + potential quote char
  });

  it("sentiment bar with 0 cons shows full green", () => {
    const card = makeCard();
    const summary = makeSummary({ cons: [] });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const posFill = card.querySelector(".bas-sp-sentiment__pos") as HTMLElement;
    expect(posFill.style.width).toBe("100%");
    const negFill = card.querySelector(".bas-sp-sentiment__neg") as HTMLElement;
    expect(negFill.style.width).toBe("0%");
  });

  it("sentiment bar with 0 pros shows full red", () => {
    const card = makeCard();
    const summary = makeSummary({
      pros: [],
      cons: [makeAspect({ sentiment: "negative", avgRating: 2.5 })],
      oneLiner: "👎 battery",
    });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const posFill = card.querySelector(".bas-sp-sentiment__pos") as HTMLElement;
    expect(posFill.style.width).toBe("0%");
    const negFill = card.querySelector(".bas-sp-sentiment__neg") as HTMLElement;
    expect(negFill.style.width).toBe("100%");
  });

  it("inserts after .bas-review-badge anchor if no h2", () => {
    const card = document.createElement("div");
    const badge = document.createElement("span");
    badge.className = "bas-review-badge";
    card.appendChild(badge);
    injectSummaryPanel(card, { summary: makeSummary() });
    expect(badge.nextElementSibling?.classList.contains("bas-review-summary")).toBe(true);
  });

  it("appends to card when no anchor found", () => {
    const card = document.createElement("div");
    injectSummaryPanel(card, { summary: makeSummary() });
    expect(card.querySelector(".bas-review-summary")).toBeTruthy();
    expect(card.querySelector(".bas-summary-panel")).toBeTruthy();
  });

  it("handles aspect with 0 mentions", () => {
    const card = makeCard();
    const summary = makeSummary({
      pros: [makeAspect({ mentions: 0 })],
      cons: [],
    });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const meta = card.querySelector(".bas-sp-aspect__meta");
    expect(meta?.textContent).toBe("0×");
  });

  it("renders rating bar width proportional to rating", () => {
    const card = makeCard();
    const summary = makeSummary({
      pros: [makeAspect({ avgRating: 2.5 })],
      cons: [],
    });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    const barFill = card.querySelector(".bas-sp-aspect__fill") as HTMLElement;
    expect(barFill.style.width).toBe("50%"); // 2.5/5 * 100
  });

  it("no sentiment bar when both pros and cons are empty", () => {
    const card = makeCard();
    const summary = makeSummary({ pros: [], cons: [], oneLiner: "Neutral" });
    injectSummaryPanel(card, { summary });
    const oneLiner = card.querySelector(".bas-review-summary") as HTMLElement;
    oneLiner.click();
    expect(card.querySelector(".bas-sp-sentiment")).toBeNull();
  });
});
