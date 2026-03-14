import { describe, it, expect, beforeEach } from "vitest";
import {
  isPaginationActive,
  stopPagination,
  removePaginatedCards,
  calculatePagesToFetch,
  updateNextPageLink,
} from "../src/content/paginator";

describe("paginator", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    stopPagination();
  });

  it("isPaginationActive() returns false initially", () => {
    expect(isPaginationActive()).toBe(false);
  });

  it("stopPagination() is callable without error", () => {
    expect(() => stopPagination()).not.toThrow();
    expect(isPaginationActive()).toBe(false);
  });

  it("removePaginatedCards() removes marked elements from DOM", () => {
    const card1 = document.createElement("div");
    card1.dataset.basPaginated = "true";
    card1.textContent = "paginated card 1";
    document.body.appendChild(card1);

    const card2 = document.createElement("div");
    card2.dataset.basPaginated = "true";
    card2.textContent = "paginated card 2";
    document.body.appendChild(card2);

    expect(document.querySelectorAll('[data-bas-paginated="true"]').length).toBe(2);

    removePaginatedCards();

    expect(document.querySelectorAll('[data-bas-paginated="true"]').length).toBe(0);
  });

  it("removePaginatedCards() doesn't remove non-paginated elements", () => {
    const regular = document.createElement("div");
    regular.id = "regular-card";
    regular.textContent = "regular card";
    document.body.appendChild(regular);

    const paginated = document.createElement("div");
    paginated.dataset.basPaginated = "true";
    paginated.textContent = "paginated card";
    document.body.appendChild(paginated);

    removePaginatedCards();

    expect(document.getElementById("regular-card")).not.toBeNull();
    expect(document.querySelectorAll('[data-bas-paginated="true"]').length).toBe(0);
  });

  it("multiple calls to removePaginatedCards() are safe", () => {
    const card = document.createElement("div");
    card.dataset.basPaginated = "true";
    document.body.appendChild(card);

    removePaginatedCards();
    expect(() => removePaginatedCards()).not.toThrow();

    expect(document.querySelectorAll('[data-bas-paginated="true"]').length).toBe(0);
  });
});

describe("calculatePagesToFetch", () => {
  it("returns 0 when target <= current count", () => {
    expect(calculatePagesToFetch(50, 50, 48)).toBe(0);
    expect(calculatePagesToFetch(60, 50, 48)).toBe(0);
  });

  it("returns 0 when items per page is 0 or negative", () => {
    expect(calculatePagesToFetch(50, 200, 0)).toBe(0);
    expect(calculatePagesToFetch(50, 200, -10)).toBe(0);
  });

  it("calculates 1 extra page for small increase", () => {
    // 50 items, want 100, ~48 per page → need 2 pages... ceil(50/48) = 2
    // Wait: (100-50)/48 = 1.04 → ceil = 2
    expect(calculatePagesToFetch(50, 100, 48)).toBe(2);
    // With exactly 50 per page: (100-50)/50 = 1.0 → ceil = 1
    expect(calculatePagesToFetch(50, 100, 50)).toBe(1);
  });

  it("calculates correctly for 200 target with 48 items/page", () => {
    // (200-48)/48 = 3.17 → ceil = 4 pages
    expect(calculatePagesToFetch(48, 200, 48)).toBe(4);
  });

  it("calculates correctly for 500 target with 50 items/page", () => {
    // (500-50)/50 = 9 → 9 pages
    expect(calculatePagesToFetch(50, 500, 50)).toBe(9);
  });

  it("handles edge case where current is 0", () => {
    // (100-0)/50 = 2
    expect(calculatePagesToFetch(0, 100, 50)).toBe(2);
  });

  it("rounds up correctly when division is not even", () => {
    // (150-50)/48 = 2.08 → ceil = 3
    expect(calculatePagesToFetch(50, 150, 48)).toBe(3);
  });

  it("returns 1 when only slightly more items needed", () => {
    // (51-50)/50 = 0.02 → ceil = 1
    expect(calculatePagesToFetch(50, 51, 50)).toBe(1);
  });
});

describe("updateNextPageLink", () => {
  it("updates the Next link href to skip past prefetched pages", () => {
    document.body.innerHTML = `
      <a class="s-pagination-next" href="https://www.amazon.com/s?k=test&page=2">Next</a>
    `;
    updateNextPageLink(6);
    const link = document.querySelector<HTMLAnchorElement>(".s-pagination-next")!;
    const url = new URL(link.href);
    expect(url.searchParams.get("page")).toBe("7");
  });

  it("does not throw when no Next link exists", () => {
    document.body.innerHTML = "";
    expect(() => updateNextPageLink(6)).not.toThrow();
  });

  it("does not update a disabled Next link", () => {
    document.body.innerHTML = `
      <a class="s-pagination-next s-pagination-disabled" href="https://www.amazon.com/s?k=test&page=2">Next</a>
    `;
    updateNextPageLink(6);
    const link = document.querySelector<HTMLAnchorElement>(".s-pagination-next")!;
    const url = new URL(link.href);
    expect(url.searchParams.get("page")).toBe("2");
  });
});
