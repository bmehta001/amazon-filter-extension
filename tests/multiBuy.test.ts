import { describe, it, expect } from "vitest";
import { extractMultiBuyOffer } from "../src/brand/fetcher";
import { computeSavingsStack, injectMultiBuyBadge, removeMultiBuyBadge } from "../src/content/ui/savingsBadge";
import type { Product } from "../src/types";

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    element: document.createElement("div"),
    title: "Test Product",
    reviewCount: 100,
    rating: 4.5,
    price: 29.99,
    brand: "TestBrand",
    isSponsored: false,
    asin: "B001TEST",
    ...overrides,
  };
}

describe("extractMultiBuyOffer", () => {
  it("extracts 'Buy 2, save 10%' from promo section", () => {
    const doc = makeDoc(`
      <div id="promoPriceBlockMessage_feature_div">
        Buy 2, save 10% on this item.
      </div>
    `);
    const result = extractMultiBuyOffer(doc);
    expect(result).not.toBeNull();
    expect(result!.minQuantity).toBe(2);
    expect(result!.text).toContain("Buy 2");
  });

  it("extracts 'Buy 3, get 15% off' from buy box", () => {
    const doc = makeDoc(`
      <div id="ppd">
        Special offer: Buy 3, get 15% off when you checkout.
      </div>
    `);
    const result = extractMultiBuyOffer(doc);
    expect(result).not.toBeNull();
    expect(result!.minQuantity).toBe(3);
  });

  it("extracts '3 for $19.99' pattern", () => {
    const doc = makeDoc(`
      <div id="promoPriceBlockMessage_feature_div">
        3 for $19.99 — mix and match colors.
      </div>
    `);
    const result = extractMultiBuyOffer(doc);
    expect(result).not.toBeNull();
    expect(result!.minQuantity).toBe(3);
  });

  it("extracts 'Save 20% when you buy 4' pattern", () => {
    const doc = makeDoc(`
      <div id="tp_feature_div">
        Save 20% when you buy 4 or more.
      </div>
    `);
    const result = extractMultiBuyOffer(doc);
    expect(result).not.toBeNull();
    expect(result!.minQuantity).toBe(4);
  });

  it("extracts 'purchase 2 or more' from detail bullets", () => {
    const doc = makeDoc(`
      <div id="detailBullets_feature_div">
        <span>Purchase 2 or more and save on shipping.</span>
      </div>
    `);
    const result = extractMultiBuyOffer(doc);
    expect(result).not.toBeNull();
    expect(result!.minQuantity).toBe(2);
  });

  it("returns null when no multi-buy offer exists", () => {
    const doc = makeDoc(`
      <div id="ppd">
        <span>Ships from and sold by Amazon.com.</span>
      </div>
    `);
    expect(extractMultiBuyOffer(doc)).toBeNull();
  });

  it("returns null for empty document", () => {
    const doc = makeDoc("<html><body></body></html>");
    expect(extractMultiBuyOffer(doc)).toBeNull();
  });

  it("rejects quantity of 1 (not a real multi-buy)", () => {
    const doc = makeDoc(`
      <div id="promoPriceBlockMessage_feature_div">
        Buy 1, save 5% with Subscribe & Save.
      </div>
    `);
    expect(extractMultiBuyOffer(doc)).toBeNull();
  });

  it("truncates long offer text to 80 chars", () => {
    const longText = "Buy 2, get 10% off when you purchase this and any other qualifying items in our enormous selection of home goods and kitchen accessories";
    const doc = makeDoc(`
      <div id="promoPriceBlockMessage_feature_div">${longText}</div>
    `);
    const result = extractMultiBuyOffer(doc);
    expect(result).not.toBeNull();
    expect(result!.text.length).toBeLessThanOrEqual(80);
  });
});

describe("computeSavingsStack with multi-buy", () => {
  it("includes multi-buy as informational layer", () => {
    const product = makeProduct({
      price: 20,
      listPrice: 25,
      multiBuyOffer: { text: "Buy 2, save 10%", minQuantity: 2 },
    });
    const stack = computeSavingsStack(product);
    expect(stack).not.toBeNull();
    const mbLayer = stack!.layers.find(l => l.type === "multi-buy");
    expect(mbLayer).toBeDefined();
    expect(mbLayer!.amount).toBe(0); // informational only
    expect(mbLayer!.label).toBe("Buy 2, save 10%");
  });

  it("multi-buy alone does not create a savings stack", () => {
    const product = makeProduct({
      price: 20,
      multiBuyOffer: { text: "Buy 3 for $50", minQuantity: 3 },
    });
    // No real savings (no list discount, coupon, or S&S)
    const stack = computeSavingsStack(product);
    expect(stack).toBeNull();
  });

  it("multi-buy appears alongside real savings layers", () => {
    const product = makeProduct({
      price: 20,
      coupon: { type: "percent", value: 10 },
      multiBuyOffer: { text: "Buy 2, save 15%", minQuantity: 2 },
    });
    const stack = computeSavingsStack(product);
    expect(stack).not.toBeNull();
    expect(stack!.layers).toHaveLength(2); // coupon + multi-buy
    expect(stack!.layers[0].type).toBe("coupon");
    expect(stack!.layers[1].type).toBe("multi-buy");
  });
});

describe("injectMultiBuyBadge / removeMultiBuyBadge", () => {
  it("injects a standalone multi-buy badge", () => {
    const card = document.createElement("div");
    const price = document.createElement("span");
    price.className = "a-price";
    card.appendChild(price);

    injectMultiBuyBadge(card, "Buy 2, save 10%");

    const badge = card.querySelector(".bas-multi-buy-badge");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain("Buy 2, save 10%");
    expect(badge!.textContent).toContain("🏷️");
  });

  it("removes existing badge before re-injecting", () => {
    const card = document.createElement("div");
    injectMultiBuyBadge(card, "Buy 2, save 10%");
    injectMultiBuyBadge(card, "Buy 3, save 15%");
    const badges = card.querySelectorAll(".bas-multi-buy-badge");
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toContain("Buy 3");
  });

  it("removeMultiBuyBadge clears the badge", () => {
    const card = document.createElement("div");
    injectMultiBuyBadge(card, "Buy 2, save 10%");
    expect(card.querySelector(".bas-multi-buy-badge")).not.toBeNull();
    removeMultiBuyBadge(card);
    expect(card.querySelector(".bas-multi-buy-badge")).toBeNull();
  });
});
