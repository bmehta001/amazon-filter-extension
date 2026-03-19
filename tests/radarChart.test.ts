import { describe, it, expect, beforeEach } from "vitest";
import type { TopicScore } from "../src/review/types";
import { buildRadarChart } from "../src/content/ui/radarChart";

function makeTopicScore(overrides: Partial<TopicScore> & { categoryId: string }): TopicScore {
  return {
    avgRating: 4.0,
    sentenceMentions: 5,
    reviewMentions: 3,
    sentiment: "positive",
    ...overrides,
  };
}

describe("buildRadarChart", () => {
  beforeEach(() => {
    // Ensure clean DOM
    document.body.innerHTML = "";
  });

  it("renders SVG with correct number of data points for 4 topics", () => {
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "product-quality", avgRating: 4.5 }),
      makeTopicScore({ categoryId: "performance", avgRating: 3.0, sentiment: "mixed" }),
      makeTopicScore({ categoryId: "durability", avgRating: 2.0, sentiment: "negative" }),
      makeTopicScore({ categoryId: "ease-of-use", avgRating: 5.0 }),
    ];

    const el = buildRadarChart(topics);
    document.body.appendChild(el);

    const svg = el.querySelector("svg");
    expect(svg).not.toBeNull();

    // Should have 4 data dots (circles) with r=3
    const dots = svg!.querySelectorAll('circle[r="3"]');
    expect(dots).toHaveLength(4);

    // Should have 4 labels
    const labels = svg!.querySelectorAll("text");
    expect(labels).toHaveLength(4);
  });

  it("renders fallback display for fewer than 3 topics", () => {
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "product-quality", avgRating: 4.5 }),
      makeTopicScore({ categoryId: "performance", avgRating: 2.0, sentiment: "negative" }),
    ];

    const el = buildRadarChart(topics);
    document.body.appendChild(el);

    // Should NOT have SVG (fallback mode)
    expect(el.querySelector("svg")).toBeNull();
    // Should have text content
    expect(el.textContent).toContain("Product Quality");
    expect(el.textContent).toContain("Performance");
  });

  it("limits to 6 topics maximum", () => {
    const topics: TopicScore[] = Array.from({ length: 8 }, (_, i) => makeTopicScore({
      categoryId: ["product-quality", "performance", "durability", "ease-of-use", "value", "appearance", "compatibility", "size-fit"][i],
      avgRating: 3 + (i % 3),
    }));

    const el = buildRadarChart(topics);
    document.body.appendChild(el);

    const labels = el.querySelectorAll("text");
    expect(labels.length).toBeLessThanOrEqual(6);
  });

  it("applies color-coded sentiment classes to labels", () => {
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "product-quality", avgRating: 4.5, sentiment: "positive" }),
      makeTopicScore({ categoryId: "performance", avgRating: 2.0, sentiment: "negative" }),
      makeTopicScore({ categoryId: "durability", avgRating: 3.5, sentiment: "mixed" }),
    ];

    const el = buildRadarChart(topics);
    document.body.appendChild(el);

    const labels = el.querySelectorAll("text");
    const classNames = Array.from(labels).map((l) => l.getAttribute("class"));

    expect(classNames.some((c) => c?.includes("positive"))).toBe(true);
    expect(classNames.some((c) => c?.includes("negative"))).toBe(true);
    expect(classNames.some((c) => c?.includes("mixed"))).toBe(true);
  });

  it("shows trend icons in labels", () => {
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "product-quality", trend: "rising" }),
      makeTopicScore({ categoryId: "performance", trend: "falling" }),
      makeTopicScore({ categoryId: "durability", trend: "stable" }),
    ];

    const el = buildRadarChart(topics);
    document.body.appendChild(el);

    const labels = Array.from(el.querySelectorAll("text")).map((l) => l.textContent);
    expect(labels.some((l) => l?.includes("↑"))).toBe(true);
    expect(labels.some((l) => l?.includes("↓"))).toBe(true);
  });

  it("clamps scores to 0-5 range", () => {
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "product-quality", avgRating: 6.0 }),
      makeTopicScore({ categoryId: "performance", avgRating: -1.0, sentiment: "negative" }),
      makeTopicScore({ categoryId: "durability", avgRating: 3.0, sentiment: "mixed" }),
    ];

    // Should not throw
    const el = buildRadarChart(topics);
    expect(el).toBeTruthy();
    expect(el.querySelector("svg")).not.toBeNull();
  });

  it("includes tooltips with score details", () => {
    const topics: TopicScore[] = [
      makeTopicScore({ categoryId: "product-quality", avgRating: 4.2, reviewMentions: 5 }),
      makeTopicScore({ categoryId: "performance", avgRating: 3.1, reviewMentions: 2, sentiment: "mixed" }),
      makeTopicScore({ categoryId: "durability", avgRating: 1.5, reviewMentions: 3, sentiment: "negative" }),
    ];

    const el = buildRadarChart(topics);
    document.body.appendChild(el);

    const titles = el.querySelectorAll("title");
    const titleTexts = Array.from(titles).map((t) => t.textContent);
    expect(titleTexts.some((t) => t?.includes("4.2★"))).toBe(true);
    expect(titleTexts.some((t) => t?.includes("5 reviews"))).toBe(true);
  });
});
