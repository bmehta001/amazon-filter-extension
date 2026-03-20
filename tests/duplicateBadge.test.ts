import { describe, it, expect, beforeEach } from "vitest";
import { injectDuplicateBadge, removeDuplicateBadge } from "../src/content/ui/duplicateBadge";
import type { DuplicateGroup } from "../src/content/crossListingDedup";
import type { Product } from "../src/types";

function makeCard(): HTMLElement {
  const card = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = "Product Title";
  card.appendChild(h2);
  return card;
}

function makeProduct(title: string): Product {
  return {
    element: document.createElement("div"),
    title,
    reviewCount: 100,
    rating: 4.5,
    price: 29.99,
    brand: "TestBrand",
    isSponsored: false,
    asin: "B001",
  };
}

describe("injectDuplicateBadge", () => {
  let card: HTMLElement;

  beforeEach(() => {
    card = makeCard();
  });

  it("injects a badge for the best product", () => {
    const group: DuplicateGroup = { bestIndex: 0, memberIndices: [0, 1], similarity: 0.75 };
    injectDuplicateBadge(card, group, 0, [makeProduct("A"), makeProduct("B")]);
    const badge = card.querySelector(".bas-dup-badge");
    expect(badge).toBeTruthy();
    expect(badge?.classList.contains("bas-dup-badge--best")).toBe(true);
    expect(badge?.textContent).toContain("Best of 2");
  });

  it("injects a badge for a duplicate product", () => {
    const group: DuplicateGroup = { bestIndex: 0, memberIndices: [0, 1], similarity: 0.7 };
    injectDuplicateBadge(card, group, 1, [makeProduct("A"), makeProduct("B")]);
    const badge = card.querySelector(".bas-dup-badge");
    expect(badge).toBeTruthy();
    expect(badge?.classList.contains("bas-dup-badge--dupe")).toBe(true);
    expect(badge?.textContent).toContain("Similar listing");
  });

  it("replaces existing badge (idempotent)", () => {
    const group: DuplicateGroup = { bestIndex: 0, memberIndices: [0, 1], similarity: 0.7 };
    injectDuplicateBadge(card, group, 0, [makeProduct("A"), makeProduct("B")]);
    injectDuplicateBadge(card, group, 0, [makeProduct("A"), makeProduct("B")]);
    const badges = card.querySelectorAll(".bas-dup-badge");
    expect(badges).toHaveLength(1);
  });

  it("inserts after h2 anchor", () => {
    const group: DuplicateGroup = { bestIndex: 0, memberIndices: [0, 1], similarity: 0.7 };
    injectDuplicateBadge(card, group, 0, [makeProduct("A"), makeProduct("B")]);
    const h2 = card.querySelector("h2");
    expect(h2?.nextElementSibling?.classList.contains("bas-dup-badge")).toBe(true);
  });
});

describe("removeDuplicateBadge", () => {
  it("removes the badge", () => {
    const card = makeCard();
    const group: DuplicateGroup = { bestIndex: 0, memberIndices: [0, 1], similarity: 0.7 };
    injectDuplicateBadge(card, group, 0, [makeProduct("A"), makeProduct("B")]);
    expect(card.querySelector(".bas-dup-badge")).toBeTruthy();
    removeDuplicateBadge(card);
    expect(card.querySelector(".bas-dup-badge")).toBeNull();
  });

  it("is safe when no badge exists", () => {
    const card = makeCard();
    expect(() => removeDuplicateBadge(card)).not.toThrow();
  });
});
