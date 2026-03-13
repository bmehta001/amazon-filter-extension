import { describe, it, expect, beforeEach } from "vitest";
import {
  isPaginationActive,
  stopPagination,
  removePaginatedCards,
  calculatePrefetchRange,
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
    expect(() => removePaginatedCards()).not.toThrow();

    expect(document.querySelectorAll('[data-bas-paginated="true"]').length).toBe(0);
  });
});

describe("calculatePrefetchRange", () => {
  it("on page 1 with no prior prefetch, fetches pages 2–6 for 5 pages", () => {
    const result = calculatePrefetchRange(1, 0, 5, 20);
    expect(result).toEqual({ startPage: 2, endPage: 6 });
  });

  it("on page 3 with no prior prefetch, fetches pages 4–8 for 5 pages", () => {
    const result = calculatePrefetchRange(3, 0, 5, 20);
    expect(result).toEqual({ startPage: 4, endPage: 8 });
  });

  it("on page 1 after prefetching through 6, skips ahead to page 7", () => {
    // User changed prefetch from 5 to 8 on page 1 after already reaching page 6
    const result = calculatePrefetchRange(1, 6, 8, 20);
    // Already fetched 5 beyond current (pages 2-6), need 3 more (7,8,9)
    expect(result).toEqual({ startPage: 7, endPage: 9 });
  });

  it("on page 2 after prefetching through 6 from page 1, starts at page 7", () => {
    const result = calculatePrefetchRange(2, 6, 5, 20);
    // Already fetched 4 beyond current (pages 3-6), need 1 more (page 7)
    expect(result).toEqual({ startPage: 7, endPage: 7 });
  });

  it("returns null when all requested pages already prefetched", () => {
    // On page 1, already prefetched through 6, only asking for 5
    const result = calculatePrefetchRange(1, 6, 5, 20);
    expect(result).toBeNull();
  });

  it("returns null when already prefetched more than requested", () => {
    const result = calculatePrefetchRange(1, 10, 5, 20);
    expect(result).toBeNull();
  });

  it("caps endPage at maxAvailablePages", () => {
    const result = calculatePrefetchRange(1, 0, 10, 7);
    expect(result).toEqual({ startPage: 2, endPage: 7 });
  });

  it("returns null when startPage exceeds maxAvailablePages", () => {
    const result = calculatePrefetchRange(1, 0, 5, 1);
    expect(result).toBeNull();
  });

  it("on page 8 past prior prefetch range of 6, starts from 9", () => {
    // User manually navigated past the prefetched range
    const result = calculatePrefetchRange(8, 6, 5, 20);
    expect(result).toEqual({ startPage: 9, endPage: 13 });
  });

  it("handles pagesToFetch of 1", () => {
    const result = calculatePrefetchRange(1, 0, 1, 20);
    expect(result).toEqual({ startPage: 2, endPage: 2 });
  });

  it("handles pagesToFetch of 0", () => {
    const result = calculatePrefetchRange(1, 0, 0, 20);
    expect(result).toBeNull();
  });

  it("consecutive prefetch increments work correctly", () => {
    // First: on page 1, prefetch 3 → pages 2-4
    const first = calculatePrefetchRange(1, 0, 3, 20);
    expect(first).toEqual({ startPage: 2, endPage: 4 });

    // Then user increases to 5 while still on page 1
    // lastPrefetched is now 4, need 2 more
    const second = calculatePrefetchRange(1, 4, 5, 20);
    expect(second).toEqual({ startPage: 5, endPage: 6 });

    // Then user increases to 8 while still on page 1
    // lastPrefetched is now 6, need 2 more
    const third = calculatePrefetchRange(1, 6, 8, 20);
    expect(third).toEqual({ startPage: 7, endPage: 9 });
  });

  it("navigating forward accumulates correctly across pages", () => {
    // Page 1, prefetch 5 → pages 2-6
    const r1 = calculatePrefetchRange(1, 0, 5, 20);
    expect(r1).toEqual({ startPage: 2, endPage: 6 });

    // Navigate to page 2, prefetch 5 → pages 7-7 (only 1 new needed)
    const r2 = calculatePrefetchRange(2, 6, 5, 20);
    expect(r2).toEqual({ startPage: 7, endPage: 7 });

    // Navigate to page 7, prefetch 5 → pages 8-12
    const r3 = calculatePrefetchRange(7, 7, 5, 20);
    expect(r3).toEqual({ startPage: 8, endPage: 12 });
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
    // Disabled links are excluded by the :not selector, so href should be unchanged
    expect(url.searchParams.get("page")).toBe("2");
  });
});
