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
