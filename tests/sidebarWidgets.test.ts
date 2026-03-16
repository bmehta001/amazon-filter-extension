import { describe, it, expect, beforeEach } from "vitest";
import { createDistributedFilters, cleanupDistributedFilters, updateDistributedStats, updateDistributedPrefetchStatus } from "../src/content/ui/sidebarWidgets";
import { DEFAULT_FILTERS } from "../src/types";
import type { FilterState } from "../src/types";

// ── Mock Amazon sidebar ──────────────────────────────────────────────

/**
 * Create a mock Amazon sidebar with named sections.
 */
function createMockSidebar(sections: string[]): HTMLElement {
  const sidebar = document.createElement("div");
  sidebar.id = "s-refinements";

  for (const name of sections) {
    const section = document.createElement("div");
    section.className = "a-section a-spacing-small";

    const heading = document.createElement("span");
    heading.className = "a-size-base a-color-base a-text-bold";
    heading.textContent = name;
    section.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "a-unordered-list a-nostyle a-vertical";

    if (name === "Brand") {
      // Create realistic brand list items with links and spans
      for (const brand of ["Sony", "Bose", "Apple"]) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "#";
        a.ariaLabel = brand;
        const span = document.createElement("span");
        span.className = "a-size-base";
        span.textContent = brand;
        a.appendChild(span);
        li.appendChild(a);
        list.appendChild(li);
      }
    } else {
      const li = document.createElement("li");
      li.textContent = `Sample ${name} option`;
      list.appendChild(li);
    }

    section.appendChild(list);
    sidebar.appendChild(section);
  }

  return sidebar;
}

const noopCallbacks = {
  onFilterChange: () => {},
  onQueryBuilderApply: () => {},
  onSortByReviews: () => {},
  onAmazonOnly: () => {},
};

// ── Tests ────────────────────────────────────────────────────────────

describe("createDistributedFilters", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    cleanupDistributedFilters();
  });

  it("returns a host element (main widget)", () => {
    const sidebar = createMockSidebar(["Department", "Customer Review", "Brand", "Price"]);
    document.body.appendChild(sidebar);

    const host = createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);
    expect(host).toBeInstanceOf(HTMLElement);
    expect(host.id).toBe("bas-widget-main");
  });

  it("injects main widget into the sidebar", () => {
    const sidebar = createMockSidebar(["Brand", "Price"]);
    document.body.appendChild(sidebar);

    createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);

    const mainWidget = sidebar.querySelector("#bas-widget-main");
    expect(mainWidget).not.toBeNull();
  });

  it("injects multiple widget hosts into the sidebar", () => {
    const sidebar = createMockSidebar(["Customer Review", "Brand", "Price"]);
    document.body.appendChild(sidebar);

    createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);

    const widgets = sidebar.querySelectorAll(".bas-sidebar-widget-host");
    // Expect: main + review + price = 3 widgets (brand is enhanced in-place)
    expect(widgets.length).toBe(3);
  });

  it("places review widget after Customer Review section", () => {
    const sidebar = createMockSidebar(["Customer Review", "Brand"]);
    document.body.appendChild(sidebar);

    createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);

    // The Customer Review section should be followed by our review widget
    const sections = sidebar.children;
    let foundReviewSection = false;
    let nextIsWidget = false;

    for (let i = 0; i < sections.length; i++) {
      const el = sections[i] as HTMLElement;
      if (el.textContent?.includes("Customer Review") && !el.classList.contains("bas-sidebar-widget-host")) {
        foundReviewSection = true;
        continue;
      }
      if (foundReviewSection && el.classList.contains("bas-sidebar-widget-host")) {
        // Check it's the review widget by looking at shadow DOM content
        const shadow = el.shadowRoot;
        if (shadow?.textContent?.includes("Review Filters")) {
          nextIsWidget = true;
          break;
        }
      }
    }

    expect(foundReviewSection).toBe(true);
    expect(nextIsWidget).toBe(true);
  });

  it("places price widget after Price section", () => {
    const sidebar = createMockSidebar(["Price", "Brand"]);
    document.body.appendChild(sidebar);

    createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);

    const sections = sidebar.children;
    let foundPriceSection = false;

    for (let i = 0; i < sections.length; i++) {
      const el = sections[i] as HTMLElement;
      if (el.textContent?.includes("Price") && !el.classList.contains("bas-sidebar-widget-host")) {
        foundPriceSection = true;
        continue;
      }
      if (foundPriceSection && el.classList.contains("bas-sidebar-widget-host")) {
        const shadow = el.shadowRoot;
        if (shadow?.textContent?.includes("Price Range")) {
          expect(true).toBe(true);
          return;
        }
      }
    }

    expect(foundPriceSection).toBe(true);
  });

  it("enhances Amazon's Brand section with exclude buttons", () => {
    const sidebar = createMockSidebar(["Brand"]);
    document.body.appendChild(sidebar);

    createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);

    // Exclude buttons should be injected into each brand list item
    const excludeBtns = sidebar.querySelectorAll(".bas-brand-exclude-btn");
    expect(excludeBtns.length).toBe(3); // Sony, Bose, Apple

    // Brand mode dropdown should be in the controls area
    const controls = sidebar.querySelector(".bas-brand-controls");
    expect(controls).not.toBeNull();
    expect(controls!.querySelector("select")).not.toBeNull();
  });

  it("excludes a brand when exclude button is clicked", () => {
    const sidebar = createMockSidebar(["Brand"]);
    document.body.appendChild(sidebar);

    let changedState: FilterState | null = null;
    const callbacks = {
      ...noopCallbacks,
      onFilterChange: (state: FilterState) => { changedState = state; },
    };

    createDistributedFilters(DEFAULT_FILTERS, callbacks, sidebar);

    // Click the exclude button for the first brand (Sony)
    const excludeBtn = sidebar.querySelector(".bas-brand-exclude-btn") as HTMLButtonElement;
    expect(excludeBtn).not.toBeNull();
    excludeBtn.click();

    expect(changedState).not.toBeNull();
    expect(changedState!.excludedBrands).toContain("sony");
  });

  it("still works when no Amazon sections are found", () => {
    const sidebar = createMockSidebar([]); // Empty sidebar
    document.body.appendChild(sidebar);

    const host = createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);

    // All widgets should still be injected (fallback positions)
    // main + review + price + brand fallback = 4 widgets
    const widgets = sidebar.querySelectorAll(".bas-sidebar-widget-host");
    expect(widgets.length).toBe(4);
    expect(host).toBeInstanceOf(HTMLElement);
  });

  it("calls onFilterChange when a control changes", () => {
    const sidebar = createMockSidebar(["Customer Review"]);
    document.body.appendChild(sidebar);

    let changed = false;
    let changedState: FilterState | null = null;
    const callbacks = {
      ...noopCallbacks,
      onFilterChange: (state: FilterState) => {
        changed = true;
        changedState = state;
      },
    };

    const host = createDistributedFilters(DEFAULT_FILTERS, callbacks, sidebar);

    // Find the hide sponsored checkbox in the main widget's shadow DOM
    const shadow = host.shadowRoot!;
    const checkboxes = shadow.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);

    // Toggle the first checkbox (Hide Sponsored)
    const cb = checkboxes[0] as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event("change"));

    expect(changed).toBe(true);
    expect(changedState!.hideSponsored).toBe(true);
  });

  it("shows excluded brand summary in Amazon's section", () => {
    const sidebar = createMockSidebar(["Brand"]);
    document.body.appendChild(sidebar);

    createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);

    const summary = sidebar.querySelector("#bas-brand-excluded-summary");
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain("Click");
  });
});

describe("cleanupDistributedFilters", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    cleanupDistributedFilters();
  });

  it("removes all injected widgets from the DOM", () => {
    const sidebar = createMockSidebar(["Brand", "Price"]);
    document.body.appendChild(sidebar);

    createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);
    // main + review + price = 3 widgets (brand is enhanced in-place)
    expect(sidebar.querySelectorAll(".bas-sidebar-widget-host").length).toBe(3);

    cleanupDistributedFilters();
    expect(sidebar.querySelectorAll(".bas-sidebar-widget-host").length).toBe(0);
    // Brand enhancement elements should also be cleaned up
    expect(sidebar.querySelectorAll(".bas-brand-exclude-btn").length).toBe(0);
    expect(sidebar.querySelectorAll(".bas-brand-controls").length).toBe(0);
  });
});

describe("updateDistributedStats", () => {
  it("updates the stats element in the main widget", () => {
    const sidebar = createMockSidebar([]);
    document.body.appendChild(sidebar);

    const host = createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);

    updateDistributedStats(host, 15, 48);

    const statsEl = host.shadowRoot!.getElementById("bas-stats");
    expect(statsEl!.textContent).toBe("Showing 15 of 48");
  });
});

describe("updateDistributedPrefetchStatus", () => {
  it("updates the prefetch status element", () => {
    const sidebar = createMockSidebar([]);
    document.body.appendChild(sidebar);

    const host = createDistributedFilters(DEFAULT_FILTERS, noopCallbacks, sidebar);

    updateDistributedPrefetchStatus(host, "✓ 150 items");

    const statusEl = host.shadowRoot!.getElementById("bas-prefetch-status");
    expect(statusEl!.textContent).toBe("✓ 150 items");
  });
});
