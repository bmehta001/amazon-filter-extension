/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createAdvancedSearchToggle,
  destroyAdvancedSearch,
  ADVANCED_SEARCH_STYLES,
} from "../src/content/ui/advancedSearch";

// Mock location so URL parsing works
const mockLocation = {
  href: "https://www.amazon.com/s?k=headphones",
  search: "?k=headphones",
};
Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
});

describe("advancedSearch UI", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    destroyAdvancedSearch();
  });

  afterEach(() => {
    destroyAdvancedSearch();
  });

  it("exports CSS styles string", () => {
    expect(typeof ADVANCED_SEARCH_STYLES).toBe("string");
    expect(ADVANCED_SEARCH_STYLES).toContain(".bas-adv-panel");
    expect(ADVANCED_SEARCH_STYLES).toContain(".bas-adv-toggle");
    expect(ADVANCED_SEARCH_STYLES).toContain(".bas-adv-overlay");
    expect(ADVANCED_SEARCH_STYLES).toContain(".bas-adv-btn--primary");
  });

  it("creates a toggle button", () => {
    const btn = createAdvancedSearchToggle();
    expect(btn).toBeInstanceOf(HTMLButtonElement);
    expect(btn.className).toBe("bas-adv-toggle");
    expect(btn.textContent).toContain("Advanced Search");
    expect(btn.textContent).toContain("🔧");
  });

  it("opens panel on toggle click", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const panel = document.querySelector(".bas-adv-panel");
    expect(panel).not.toBeNull();
    expect(panel!.classList.contains("bas-adv-panel--open")).toBe(true);

    const overlay = document.querySelector(".bas-adv-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay!.classList.contains("bas-adv-overlay--open")).toBe(true);
  });

  it("injects styles into head", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const style = document.getElementById("bas-adv-styles");
    expect(style).not.toBeNull();
    expect(style!.tagName).toBe("STYLE");
  });

  it("renders all form sections", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const panel = document.querySelector(".bas-adv-panel")!;
    const labels = Array.from(panel.querySelectorAll(".bas-adv-label")).map(
      (l) => l.textContent,
    );
    expect(labels).toContain("Department");
    expect(labels).toContain("Condition");
    expect(labels).toContain("Minimum Rating");
    expect(labels).toContain("Sort By");
    expect(labels).toContain("Price Range (server-side)");
    expect(labels).toContain("Exclude Words (server-side)");
  });

  it("renders department dropdown with options", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const selects = document.querySelectorAll(".bas-adv-select");
    expect(selects.length).toBeGreaterThanOrEqual(4); // dept, condition, stars, sort
    const deptSelect = selects[0] as HTMLSelectElement;
    expect(deptSelect.options.length).toBeGreaterThan(15);
    expect(deptSelect.options[0].textContent).toBe("All Departments");
  });

  it("renders checkbox toggles", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const checkboxes = document.querySelectorAll(
      ".bas-adv-cb-row input[type='checkbox']",
    );
    expect(checkboxes.length).toBe(2); // Prime, Amazon-only
    const labels = Array.from(
      document.querySelectorAll(".bas-adv-cb-row label"),
    ).map((l) => l.textContent);
    expect(labels).toContain("Prime eligible only");
    expect(labels).toContain("Sold by Amazon only");
  });

  it("renders price range inputs", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const inputs = document.querySelectorAll(
      ".bas-adv-input[type='number']",
    ) as NodeListOf<HTMLInputElement>;
    expect(inputs.length).toBe(2);
    expect(inputs[0].placeholder).toContain("Min");
    expect(inputs[1].placeholder).toContain("Max");
  });

  it("renders exclude words textarea", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const textarea = document.querySelector(
      ".bas-adv-textarea",
    ) as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.placeholder).toContain("comma-separated");
  });

  it("renders URL preview section", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const preview = document.querySelector(".bas-adv-preview");
    expect(preview).not.toBeNull();
    expect(preview!.textContent).toContain("URL Preview");
  });

  it("renders action buttons (Reset, Cancel, Apply)", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const buttons = document.querySelectorAll(".bas-adv-btn");
    const texts = Array.from(buttons).map((b) => b.textContent!.trim());
    expect(texts).toContain("Reset");
    expect(texts).toContain("Cancel");
    expect(texts.some((t) => t.includes("Apply"))).toBe(true);
  });

  it("closes on overlay click", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const overlay = document.querySelector(".bas-adv-overlay")!;
    expect(
      document
        .querySelector(".bas-adv-panel")!
        .classList.contains("bas-adv-panel--open"),
    ).toBe(true);

    (overlay as HTMLElement).click();

    expect(
      document
        .querySelector(".bas-adv-panel")!
        .classList.contains("bas-adv-panel--open"),
    ).toBe(false);
  });

  it("closes on Cancel button click", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const cancelBtn = Array.from(document.querySelectorAll(".bas-adv-btn")).find(
      (b) => b.textContent === "Cancel",
    ) as HTMLElement;
    cancelBtn.click();

    expect(
      document
        .querySelector(".bas-adv-panel")!
        .classList.contains("bas-adv-panel--open"),
    ).toBe(false);
  });

  it("Reset clears all fields", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    // Set some values
    const selects = document.querySelectorAll(
      ".bas-adv-select",
    ) as NodeListOf<HTMLSelectElement>;
    selects[0].value = "172282"; // Electronics
    const cb = document.querySelector(
      ".bas-adv-cb-row input[type='checkbox']",
    ) as HTMLInputElement;
    cb.checked = true;
    const textarea = document.querySelector(
      ".bas-adv-textarea",
    ) as HTMLTextAreaElement;
    textarea.value = "cheap, fake";

    // Click reset
    const resetBtn = Array.from(
      document.querySelectorAll(".bas-adv-btn"),
    ).find((b) => b.textContent === "Reset") as HTMLElement;
    resetBtn.click();

    expect(selects[0].value).toBe("");
    expect(cb.checked).toBe(false);
    expect(textarea.value).toBe("");
  });

  it("Apply navigates to built URL", () => {
    // Mock location.href assignment
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...mockLocation, set href(v: string) { assignSpy(v); }, get href() { return mockLocation.href; } },
      writable: true,
      configurable: true,
    });

    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    // Check the Prime checkbox
    const cb = document.querySelector("#bas-adv-prime-eligible-only") as HTMLInputElement;
    if (cb) cb.checked = true;

    const applyBtn = Array.from(
      document.querySelectorAll(".bas-adv-btn--primary"),
    )[0] as HTMLElement;
    applyBtn.click();

    expect(assignSpy).toHaveBeenCalledTimes(1);
    const navigatedUrl = assignSpy.mock.calls[0][0] as string;
    expect(navigatedUrl).toContain("/s?");
    expect(navigatedUrl).toContain("k=headphones");

    // Restore
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
      configurable: true,
    });
  });

  it("destroyAdvancedSearch removes panel and overlay", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    expect(document.querySelector(".bas-adv-panel")).not.toBeNull();
    expect(document.querySelector(".bas-adv-overlay")).not.toBeNull();

    destroyAdvancedSearch();

    expect(document.querySelector(".bas-adv-panel")).toBeNull();
    expect(document.querySelector(".bas-adv-overlay")).toBeNull();
  });

  it("re-opening after close shows same panel", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);

    // Open
    btn.click();
    expect(
      document
        .querySelector(".bas-adv-panel")!
        .classList.contains("bas-adv-panel--open"),
    ).toBe(true);

    // Close
    const overlay = document.querySelector(".bas-adv-overlay") as HTMLElement;
    overlay.click();
    expect(
      document
        .querySelector(".bas-adv-panel")!
        .classList.contains("bas-adv-panel--open"),
    ).toBe(false);

    // Re-open
    btn.click();
    expect(
      document
        .querySelector(".bas-adv-panel")!
        .classList.contains("bas-adv-panel--open"),
    ).toBe(true);
  });

  it("renders panel title", () => {
    const btn = createAdvancedSearchToggle();
    document.body.appendChild(btn);
    btn.click();

    const h3 = document.querySelector(".bas-adv-panel h3");
    expect(h3).not.toBeNull();
    expect(h3!.textContent).toContain("Advanced Search Builder");
  });
});
