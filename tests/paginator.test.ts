import { describe, it, expect, beforeEach } from "vitest";
import {
  isPaginationActive,
  stopPagination,
  removePaginatedCards,
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
