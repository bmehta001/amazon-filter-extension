import { describe, it, expect, beforeEach } from "vitest";
import {
  injectConfidenceBadge,
  removeConfidenceBadge,
  CONFIDENCE_BADGE_STYLES,
} from "../src/content/ui/confidenceBadge";
import type { ConfidenceInput } from "../src/content/ui/confidenceBadge";
import type { TrustScoreResult } from "../src/review/trustScore";
import type { SellerTrustResult } from "../src/seller/trust";
import type { ListingIntegrityResult } from "../src/seller/listingSignals";

function makeCard(): HTMLElement {
  const card = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = "Test Product";
  card.appendChild(h2);
  return card;
}

function makeReviewTrust(score = 85): Partial<TrustScoreResult> {
  return {
    score,
    label: score >= 85 ? "trustworthy" : score >= 65 ? "mixed" : "suspicious",
    color: score >= 85 ? "green" : score >= 65 ? "yellow" : "red",
    signals: [],
    positiveSignals: [],
    maxPossibleDeduction: 100,
    totalDeduction: 100 - score,
    sampleSize: 10,
    computedAt: Date.now(),
  };
}

function makeSellerTrust(score = 70): Partial<SellerTrustResult> {
  return {
    score,
    label: score >= 70 ? "trusted" : "neutral",
    color: score >= 70 ? "green" : "gray",
    signals: [],
    summary: `Seller trust (${score}/100)`,
  };
}

function makeListingIntegrity(score = 65): Partial<ListingIntegrityResult> {
  return {
    score,
    label: score >= 70 ? "verified" : "normal",
    color: score >= 70 ? "green" : "gray",
    signals: [],
    summary: `Listing integrity (${score}/100)`,
  };
}

describe("injectConfidenceBadge", () => {
  let card: HTMLElement;
  beforeEach(() => {
    card = makeCard();
  });

  it("injects badge with review + seller trust", () => {
    const input: ConfidenceInput = {
      reviewTrust: makeReviewTrust(90) as TrustScoreResult,
      sellerTrust: makeSellerTrust(80) as SellerTrustResult,
    };
    injectConfidenceBadge(card, input);
    const badge = card.querySelector(".bas-confidence");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain("Reviews 90");
    expect(badge!.textContent).toContain("Seller 80");
  });

  it("shows all three dimensions when available", () => {
    const input: ConfidenceInput = {
      reviewTrust: makeReviewTrust(88) as TrustScoreResult,
      sellerTrust: makeSellerTrust(75) as SellerTrustResult,
      listingIntegrity: makeListingIntegrity(60) as ListingIntegrityResult,
    };
    injectConfidenceBadge(card, input);
    const badge = card.querySelector(".bas-confidence")!;
    expect(badge.textContent).toContain("Reviews 88");
    expect(badge.textContent).toContain("Seller 75");
    expect(badge.textContent).toContain("Listing 60");
  });

  it("includes tooltip with all dimensions", () => {
    const input: ConfidenceInput = {
      reviewTrust: makeReviewTrust(92) as TrustScoreResult,
      sellerTrust: makeSellerTrust(80) as SellerTrustResult,
    };
    injectConfidenceBadge(card, input);
    const badge = card.querySelector(".bas-confidence") as HTMLElement;
    expect(badge.title).toContain("Review Trust: 92/100");
    expect(badge.title).toContain("Seller Trust: 80/100");
  });

  it("does not inject twice", () => {
    const input: ConfidenceInput = {
      reviewTrust: makeReviewTrust() as TrustScoreResult,
      sellerTrust: makeSellerTrust() as SellerTrustResult,
    };
    injectConfidenceBadge(card, input);
    injectConfidenceBadge(card, input);
    expect(card.querySelectorAll(".bas-confidence").length).toBe(1);
  });

  it("renders colored dots matching trust levels", () => {
    const input: ConfidenceInput = {
      reviewTrust: makeReviewTrust(30) as TrustScoreResult, // red
      sellerTrust: makeSellerTrust(80) as SellerTrustResult, // green
    };
    injectConfidenceBadge(card, input);
    const dots = card.querySelectorAll(".bas-confidence-dot-icon");
    expect(dots.length).toBe(2);
    expect(dots[0].className).toContain("--red");
    expect(dots[1].className).toContain("--green");
  });

  it("does not inject with empty input", () => {
    injectConfidenceBadge(card, {});
    expect(card.querySelector(".bas-confidence")).toBeNull();
  });
});

describe("removeConfidenceBadge", () => {
  it("removes the badge", () => {
    const card = makeCard();
    const input: ConfidenceInput = {
      reviewTrust: makeReviewTrust() as TrustScoreResult,
      sellerTrust: makeSellerTrust() as SellerTrustResult,
    };
    injectConfidenceBadge(card, input);
    expect(card.querySelector(".bas-confidence")).not.toBeNull();
    removeConfidenceBadge(card);
    expect(card.querySelector(".bas-confidence")).toBeNull();
  });
});

describe("CONFIDENCE_BADGE_STYLES", () => {
  it("exports non-empty CSS", () => {
    expect(CONFIDENCE_BADGE_STYLES.length).toBeGreaterThan(50);
    expect(CONFIDENCE_BADGE_STYLES).toContain("bas-confidence");
    expect(CONFIDENCE_BADGE_STYLES).toContain("--green");
    expect(CONFIDENCE_BADGE_STYLES).toContain("--red");
  });
});
