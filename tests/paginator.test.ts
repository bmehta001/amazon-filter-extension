import { describe, it, expect, beforeEach } from "vitest";
import { isPaginationActive, stopPagination, removePaginatedCards } from "../src/content/paginator";

describe("paginator", () => {
  beforeEach(() => {
    // Clean up DOM between tests
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
    // Add some paginated cards
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
    // Add a non-paginated element
    const regular = document.createElement("div");
    regular.id = "regular-card";
    regular.textContent = "regular card";
    document.body.appendChild(regular);

    // Add a paginated element
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
