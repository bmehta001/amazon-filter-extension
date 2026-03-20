import { describe, it, expect, beforeEach } from "vitest";
import { injectTrustBadge, removeTrustBadge, TRUST_BADGE_STYLES } from "../src/content/ui/trustBadge";
import type { TrustScoreResult } from "../src/review/trustScore";
import type { TrustSignal } from "../src/review/trustSignals";

function makeCard(): HTMLElement {
  const card = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = "Test Product";
  card.appendChild(h2);
  return card;
}

function makeSignal(overrides: Partial<TrustSignal> = {}): TrustSignal {
  return {
    id: "test-signal",
    name: "Test Signal",
    deduction: 0,
    maxDeduction: 15,
    confidence: 1,
    reason: "No issues found",
    severity: "none",
    ...overrides,
  };
}

function makeTrustScore(overrides: Partial<TrustScoreResult> = {}): TrustScoreResult {
  return {
    score: 90,
    label: "trustworthy",
    color: "green",
    signals: [makeSignal()],
    positiveSignals: ["80% verified purchases"],
    maxPossibleDeduction: 100,
    totalDeduction: 10,
    sampleSize: 10,
    computedAt: Date.now(),
    ...overrides,
  };
}

describe("injectTrustBadge", () => {
  let card: HTMLElement;
  beforeEach(() => {
    card = makeCard();
  });

  it("shows loading state when score is null", () => {
    injectTrustBadge(card, null);
    const badge = card.querySelector(".bas-trust-badge");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain("Analyzing");
    expect(badge!.className).toContain("--loading");
  });

  it("shows green badge for trustworthy score", () => {
    injectTrustBadge(card, makeTrustScore({ score: 92, label: "trustworthy", color: "green" }));
    const badge = card.querySelector(".bas-trust-badge");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain("92/100");
    expect(badge!.textContent).toContain("Trustworthy");
    expect(badge!.className).toContain("--green");
  });

  it("shows yellow badge for mixed score", () => {
    injectTrustBadge(card, makeTrustScore({ score: 72, label: "mixed", color: "yellow" }));
    const badge = card.querySelector(".bas-trust-badge");
    expect(badge!.textContent).toContain("Mixed");
    expect(badge!.className).toContain("--yellow");
  });

  it("shows orange badge for questionable score", () => {
    injectTrustBadge(card, makeTrustScore({ score: 48, label: "questionable", color: "orange" }));
    const badge = card.querySelector(".bas-trust-badge");
    expect(badge!.textContent).toContain("Questionable");
    expect(badge!.className).toContain("--orange");
  });

  it("shows red badge for suspicious score", () => {
    injectTrustBadge(card, makeTrustScore({ score: 25, label: "suspicious", color: "red" }));
    const badge = card.querySelector(".bas-trust-badge");
    expect(badge!.textContent).toContain("Suspicious");
    expect(badge!.className).toContain("--red");
  });

  it("creates expandable detail panel", () => {
    injectTrustBadge(card, makeTrustScore());
    const detail = card.querySelector(".bas-trust-detail");
    expect(detail).not.toBeNull();
    // Initially collapsed
    expect(detail!.className).not.toContain("--expanded");
  });

  it("toggles detail panel on click", () => {
    injectTrustBadge(card, makeTrustScore());
    const badge = card.querySelector(".bas-trust-badge") as HTMLElement;
    const detail = card.querySelector(".bas-trust-detail") as HTMLElement;

    badge.click();
    expect(detail.className).toContain("--expanded");

    badge.click();
    expect(detail.className).not.toContain("--expanded");
  });

  it("shows positive signals in detail panel", () => {
    injectTrustBadge(card, makeTrustScore({
      positiveSignals: ["90% verified purchases", "Reviews spread over months"],
    }));
    const badge = card.querySelector(".bas-trust-badge") as HTMLElement;
    badge.click();
    const detail = card.querySelector(".bas-trust-detail")!;
    expect(detail.textContent).toContain("90% verified");
    expect(detail.textContent).toContain("spread over months");
  });

  it("shows concern signals with deductions", () => {
    injectTrustBadge(card, makeTrustScore({
      score: 55,
      label: "questionable",
      color: "orange",
      signals: [
        makeSignal({ id: "rating-shape", deduction: 12, confidence: 0.8, reason: "Unusual rating distribution", severity: "medium" }),
        makeSignal({ id: "date-clustering", deduction: 10, confidence: 0.9, reason: "Reviews clustered in 7-day window", severity: "high" }),
        makeSignal({ id: "clean", deduction: 0, reason: "No issues", severity: "none" }),
      ],
    }));
    const badge = card.querySelector(".bas-trust-badge") as HTMLElement;
    badge.click();
    const detail = card.querySelector(".bas-trust-detail")!;
    expect(detail.textContent).toContain("Unusual rating distribution");
    expect(detail.textContent).toContain("Reviews clustered");
    // Zero-deduction signal should NOT appear in concerns
    expect(detail.querySelectorAll(".bas-trust-detail-signal").length).toBe(2);
  });

  it("shows sample size in meta info", () => {
    injectTrustBadge(card, makeTrustScore({ sampleSize: 15 }));
    const badge = card.querySelector(".bas-trust-badge") as HTMLElement;
    badge.click();
    const meta = card.querySelector(".bas-trust-detail-meta");
    expect(meta).not.toBeNull();
    expect(meta!.textContent).toContain("15 reviews");
  });

  it("replaces existing badge on re-inject", () => {
    injectTrustBadge(card, makeTrustScore({ score: 90 }));
    injectTrustBadge(card, makeTrustScore({ score: 45, label: "questionable", color: "orange" }));
    const badges = card.querySelectorAll(".bas-trust-badge");
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toContain("45/100");
  });

  it("replaces loading badge with final score", () => {
    injectTrustBadge(card, null);
    expect(card.querySelector(".bas-trust-badge--loading")).not.toBeNull();

    injectTrustBadge(card, makeTrustScore({ score: 85 }));
    expect(card.querySelector(".bas-trust-badge--loading")).toBeNull();
    expect(card.querySelector(".bas-trust-badge--green")).not.toBeNull();
  });
});

describe("removeTrustBadge", () => {
  it("removes badge and detail panel", () => {
    const card = makeCard();
    injectTrustBadge(card, makeTrustScore());
    expect(card.querySelector(".bas-trust-badge")).not.toBeNull();
    expect(card.querySelector(".bas-trust-detail")).not.toBeNull();

    removeTrustBadge(card);
    expect(card.querySelector(".bas-trust-badge")).toBeNull();
    expect(card.querySelector(".bas-trust-detail")).toBeNull();
  });

  it("is safe to call on card without badge", () => {
    const card = makeCard();
    expect(() => removeTrustBadge(card)).not.toThrow();
  });
});

describe("TRUST_BADGE_STYLES", () => {
  it("exports non-empty CSS string", () => {
    expect(TRUST_BADGE_STYLES.length).toBeGreaterThan(100);
    expect(TRUST_BADGE_STYLES).toContain("bas-trust-badge");
    expect(TRUST_BADGE_STYLES).toContain("bas-trust-detail");
  });

  it("includes all color variants", () => {
    expect(TRUST_BADGE_STYLES).toContain("--green");
    expect(TRUST_BADGE_STYLES).toContain("--yellow");
    expect(TRUST_BADGE_STYLES).toContain("--orange");
    expect(TRUST_BADGE_STYLES).toContain("--red");
    expect(TRUST_BADGE_STYLES).toContain("--loading");
  });
});
