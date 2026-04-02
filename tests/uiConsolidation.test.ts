import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("chrome", {
  storage: {
    sync: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    local: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined },
});

import { injectProductScore, removeProductScore, PRODUCT_SCORE_STYLES } from "../src/content/ui/productScore";
import type { ProductScoreInput } from "../src/content/ui/productScore";
import { injectPriceIntel, removePriceIntel, PRICE_INTEL_STYLES } from "../src/content/ui/priceIntel";
import type { PriceIntelInput } from "../src/content/ui/priceIntel";
import { injectUnifiedReviews, removeUnifiedReviews, UNIFIED_REVIEW_STYLES } from "../src/content/ui/unifiedReviews";
import type { UnifiedReviewData } from "../src/content/ui/unifiedReviews";
import { DESIGN_TOKEN_STYLES, COLORS, RADII, FONT, getBadgeColors } from "../src/content/ui/designTokens";

// ── Design Tokens ──

describe("design tokens", () => {
  it("exports CSS custom properties block", () => {
    expect(DESIGN_TOKEN_STYLES).toContain("--bas-success");
    expect(DESIGN_TOKEN_STYLES).toContain("--bas-radius-sm");
    expect(DESIGN_TOKEN_STYLES).toContain("--bas-text-sm");
    expect(DESIGN_TOKEN_STYLES).toContain(":root");
  });

  it("exports correct color values", () => {
    expect(COLORS.success).toBe("#067d62");
    expect(COLORS.danger).toBe("#cc0c39");
    expect(COLORS.info).toBe("#007185");
  });

  it("exports correct radii", () => {
    expect(RADII.sm).toBe("4px");
    expect(RADII.md).toBe("8px");
    expect(RADII.lg).toBe("16px");
  });

  it("getBadgeColors returns correct values for each level", () => {
    const success = getBadgeColors("success");
    expect(success.fg).toBe(COLORS.success);
    expect(success.bg).toBe("#e6f7e6");

    const danger = getBadgeColors("danger");
    expect(danger.fg).toBe(COLORS.danger);
  });
});

// ── Product Score Badge ──

describe("productScore badge", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  function makeCard(): HTMLElement {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.textContent = "Product Title";
    card.appendChild(h2);
    document.body.appendChild(card);
    return card;
  }

  function makeInput(overrides: Partial<ProductScoreInput> = {}): ProductScoreInput {
    return {
      reviewTrust: { score: 85, label: "high", color: "green", signals: [], summary: "High trust" },
      sellerTrust: { score: 70, label: "good", color: "green", signals: [], summary: "Good seller" },
      ...overrides,
    } as ProductScoreInput;
  }

  it("injects badge onto card with at least 2 signals", () => {
    const card = makeCard();
    injectProductScore(card, makeInput());
    expect(card.querySelector(".bas-product-score")).not.toBeNull();
  });

  it("does not inject with 0 signals", () => {
    const card = makeCard();
    injectProductScore(card, {});
    expect(card.querySelector(".bas-product-score")).toBeNull();
  });

  it("shows colored dots for each signal", () => {
    const card = makeCard();
    injectProductScore(card, makeInput());
    const dots = card.querySelectorAll(".bas-product-score-dot");
    expect(dots.length).toBeGreaterThanOrEqual(2);
  });

  it("shows BSR label when provided", () => {
    const card = makeCard();
    injectProductScore(card, makeInput({ bsr: { rank: 247, category: "Electronics" } }));
    const bsr = card.querySelector(".bas-product-score-bsr");
    expect(bsr?.textContent).toBe("#247");
  });

  it("has expandable detail panel", () => {
    const card = makeCard();
    injectProductScore(card, makeInput());
    const panel = card.querySelector(".bas-product-score-panel");
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains("open")).toBe(false);
  });

  it("has ARIA attributes for accessibility", () => {
    const card = makeCard();
    injectProductScore(card, makeInput());
    const badge = card.querySelector(".bas-product-score");
    expect(badge?.getAttribute("role")).toBe("button");
    expect(badge?.getAttribute("tabindex")).toBe("0");
    expect(badge?.getAttribute("aria-expanded")).toBe("false");
  });

  it("has caret indicator", () => {
    const card = makeCard();
    injectProductScore(card, makeInput());
    const caret = card.querySelector(".bas-product-score-caret");
    expect(caret?.textContent).toBe("▾");
  });

  it("is idempotent", () => {
    const card = makeCard();
    injectProductScore(card, makeInput());
    injectProductScore(card, makeInput());
    expect(card.querySelectorAll(".bas-product-score").length).toBe(1);
  });

  it("removes badge and panel", () => {
    const card = makeCard();
    injectProductScore(card, makeInput());
    expect(card.querySelector(".bas-product-score")).not.toBeNull();
    removeProductScore(card);
    expect(card.querySelector(".bas-product-score")).toBeNull();
    expect(card.querySelector(".bas-product-score-panel")).toBeNull();
  });

  it("exports styles", () => {
    expect(PRODUCT_SCORE_STYLES).toContain("bas-product-score");
    expect(PRODUCT_SCORE_STYLES).toContain("bas-product-score-panel");
  });
});

// ── Price Intelligence Line ──

describe("priceIntel line", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  function makeCard(): HTMLElement {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);
    document.body.appendChild(card);
    return card;
  }

  it("injects deal score label", () => {
    const card = makeCard();
    injectPriceIntel(card, {
      dealScore: { score: 85, label: "Great Deal" } as any,
    });
    const deal = card.querySelector(".bas-price-intel-deal");
    expect(deal?.textContent).toBe("Great Deal");
  });

  it("shows savings percentage", () => {
    const card = makeCard();
    injectPriceIntel(card, {
      savingsPercent: 23,
      dealScore: { score: 70, label: "Good Deal" } as any,
    });
    const savings = card.querySelector(".bas-price-intel-savings");
    expect(savings?.textContent).toContain("Save 23%");
  });

  it("shows multi-buy offer", () => {
    const card = makeCard();
    injectPriceIntel(card, {
      multiBuy: { text: "Buy 2, save 10%", minQuantity: 2 },
      dealScore: { score: 60, label: "Normal Price" } as any,
    });
    const mb = card.querySelector(".bas-price-intel-multibuy");
    expect(mb?.textContent).toContain("Buy 2, save 10%");
  });

  it("does not inject when nothing to show", () => {
    const card = makeCard();
    injectPriceIntel(card, {});
    expect(card.querySelector(".bas-price-intel")).toBeNull();
  });

  it("is idempotent", () => {
    const card = makeCard();
    const input: PriceIntelInput = { dealScore: { score: 80, label: "Great Deal" } as any };
    injectPriceIntel(card, input);
    injectPriceIntel(card, input);
    expect(card.querySelectorAll(".bas-price-intel").length).toBe(1);
  });

  it("removes cleanly", () => {
    const card = makeCard();
    injectPriceIntel(card, { savingsPercent: 15, dealScore: { score: 60, label: "Normal Price" } as any });
    removePriceIntel(card);
    expect(card.querySelector(".bas-price-intel")).toBeNull();
  });

  it("exports styles", () => {
    expect(PRICE_INTEL_STYLES).toContain("bas-price-intel");
  });
});

// ── Unified Reviews Section ──

describe("unifiedReviews section", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  function makeCard(): HTMLElement {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);
    document.body.appendChild(card);
    return card;
  }

  it("injects section with summary data", () => {
    const card = makeCard();
    const data: UnifiedReviewData = {
      summary: {
        pros: [{ label: "build quality", mentions: 5, avgRating: 4.5, sentiment: "positive" }],
        cons: [{ label: "price", mentions: 3, avgRating: 2.5, sentiment: "negative" }],
        oneLiner: "👍 build quality  ·  👎 price",
      },
    };
    injectUnifiedReviews(card, data);
    const section = card.querySelector(".bas-reviews-section");
    expect(section).not.toBeNull();
    const header = section?.querySelector(".bas-reviews-section-header");
    expect(header?.textContent).toContain("Reviews");
  });

  it("does not inject when no data", () => {
    const card = makeCard();
    injectUnifiedReviews(card, {});
    expect(card.querySelector(".bas-reviews-section")).toBeNull();
  });

  it("includes media count in header meta", () => {
    const card = makeCard();
    const data: UnifiedReviewData = {
      mediaGallery: {
        items: [
          { url: "a.jpg", thumbnailUrl: "at.jpg", type: "image", reviewRating: 5, verified: true },
          { url: "b.jpg", thumbnailUrl: "bt.jpg", type: "image", reviewRating: 4, verified: false },
        ],
        reviewsWithMedia: 2,
      },
    };
    injectUnifiedReviews(card, data);
    const meta = card.querySelector(".bas-reviews-section-meta");
    expect(meta?.textContent).toContain("2 photos");
  });

  it("has ARIA attributes", () => {
    const card = makeCard();
    injectUnifiedReviews(card, {
      summary: { pros: [{ label: "x", mentions: 1, avgRating: 4, sentiment: "positive" }], cons: [], oneLiner: "good" },
    });
    const header = card.querySelector(".bas-reviews-section-header");
    expect(header?.getAttribute("role")).toBe("button");
    expect(header?.getAttribute("aria-expanded")).toBe("false");
  });

  it("body starts collapsed", () => {
    const card = makeCard();
    injectUnifiedReviews(card, {
      summary: { pros: [{ label: "x", mentions: 1, avgRating: 4, sentiment: "positive" }], cons: [], oneLiner: "good" },
    });
    const body = card.querySelector(".bas-reviews-section-body");
    expect(body?.classList.contains("open")).toBe(false);
  });

  it("is idempotent", () => {
    const card = makeCard();
    const data: UnifiedReviewData = {
      summary: { pros: [{ label: "x", mentions: 1, avgRating: 4, sentiment: "positive" }], cons: [], oneLiner: "good" },
    };
    injectUnifiedReviews(card, data);
    injectUnifiedReviews(card, data);
    expect(card.querySelectorAll(".bas-reviews-section").length).toBe(1);
  });

  it("removes cleanly", () => {
    const card = makeCard();
    injectUnifiedReviews(card, {
      summary: { pros: [{ label: "x", mentions: 1, avgRating: 4, sentiment: "positive" }], cons: [], oneLiner: "good" },
    });
    removeUnifiedReviews(card);
    expect(card.querySelector(".bas-reviews-section")).toBeNull();
  });

  it("exports styles", () => {
    expect(UNIFIED_REVIEW_STYLES).toContain("bas-reviews-section");
  });
});
