import { describe, it, expect, beforeEach } from "vitest";
import { injectSellerBadge, removeSellerBadge, SELLER_BADGE_STYLES } from "../src/content/ui/sellerBadge";
import type { SellerTrustResult, SellerTrustSignal } from "../src/seller/trust";

function makeCard(): HTMLElement {
  const card = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = "Test Product";
  card.appendChild(h2);
  const price = document.createElement("span");
  price.className = "a-price";
  price.textContent = "$29.99";
  card.appendChild(price);
  return card;
}

function makeSignal(overrides: Partial<SellerTrustSignal> = {}): SellerTrustSignal {
  return {
    id: "test",
    name: "Test",
    points: 10,
    maxPoints: 25,
    reason: "Test signal",
    severity: "none",
    ...overrides,
  };
}

function makeResult(overrides: Partial<SellerTrustResult> = {}): SellerTrustResult {
  return {
    score: 80,
    label: "trusted",
    color: "green",
    signals: [makeSignal()],
    summary: "Sold by TestStore — trusted seller (80/100)",
    ...overrides,
  };
}

describe("injectSellerBadge", () => {
  let card: HTMLElement;
  beforeEach(() => {
    card = makeCard();
  });

  it("injects a green badge for trusted seller", () => {
    injectSellerBadge(card, makeResult({ label: "trusted", color: "green" }));
    const badge = card.querySelector(".bas-seller-badge");
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain("--green");
    expect(badge!.textContent).toContain("Trusted Seller");
  });

  it("injects a gray badge for neutral seller", () => {
    injectSellerBadge(card, makeResult({ label: "neutral", color: "gray" }));
    const badge = card.querySelector(".bas-seller-badge");
    expect(badge!.className).toContain("--gray");
  });

  it("injects an orange badge for caution seller", () => {
    injectSellerBadge(card, makeResult({ label: "caution", color: "orange" }));
    const badge = card.querySelector(".bas-seller-badge");
    expect(badge!.className).toContain("--orange");
    expect(badge!.textContent).toContain("⚠");
  });

  it("injects a red badge for risky seller", () => {
    injectSellerBadge(card, makeResult({ label: "risky", color: "red" }));
    const badge = card.querySelector(".bas-seller-badge");
    expect(badge!.className).toContain("--red");
    expect(badge!.textContent).toContain("Risky");
  });

  it("does not inject twice", () => {
    injectSellerBadge(card, makeResult());
    injectSellerBadge(card, makeResult());
    expect(card.querySelectorAll(".bas-seller-badge").length).toBe(1);
  });

  it("includes signal details in tooltip", () => {
    injectSellerBadge(card, makeResult({
      summary: "Sold by X (80/100)",
      signals: [
        makeSignal({ points: 25, reason: "Sold by Amazon", severity: "none" }),
        makeSignal({ points: -5, reason: "Brand mismatch", severity: "low" }),
      ],
    }));
    const badge = card.querySelector(".bas-seller-badge") as HTMLElement;
    expect(badge.title).toContain("Sold by X");
    expect(badge.title).toContain("Brand mismatch");
  });
});

describe("removeSellerBadge", () => {
  it("removes the badge", () => {
    const card = makeCard();
    injectSellerBadge(card, makeResult());
    expect(card.querySelector(".bas-seller-badge")).not.toBeNull();
    removeSellerBadge(card);
    expect(card.querySelector(".bas-seller-badge")).toBeNull();
  });

  it("is safe on card without badge", () => {
    const card = makeCard();
    expect(() => removeSellerBadge(card)).not.toThrow();
  });
});

describe("SELLER_BADGE_STYLES", () => {
  it("exports non-empty CSS", () => {
    expect(SELLER_BADGE_STYLES.length).toBeGreaterThan(50);
    expect(SELLER_BADGE_STYLES).toContain("bas-seller-badge");
  });

  it("includes all color variants", () => {
    expect(SELLER_BADGE_STYLES).toContain("--green");
    expect(SELLER_BADGE_STYLES).toContain("--gray");
    expect(SELLER_BADGE_STYLES).toContain("--orange");
    expect(SELLER_BADGE_STYLES).toContain("--red");
  });
});
