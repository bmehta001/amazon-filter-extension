/**
 * Distributed sidebar filter widgets.
 *
 * Instead of one monolithic filter bar, this module injects individual
 * filter widget groups alongside Amazon's existing sidebar sections:
 *
 *   Amazon "Customer Review" section → our Reviews & Rating widget
 *   Amazon "Price" section           → our Price Range widget
 *   Amazon "Brand" section           → our Brand Filters widget
 *   (top of sidebar)                 → our main Better Search widget
 *
 * Each widget uses a small Shadow DOM for style isolation and shares
 * a closure-based state for synchronised filter changes.
 */

import type { FilterState, BrandMode, SellerFilter } from "../../types";
import { DEFAULT_FILTERS } from "../../types";
import { REVIEW_CATEGORIES } from "../../review/categories";
import { DEDUP_CATEGORIES } from "../dedup";
import sidebarWidgetStyles from "./sidebarWidgets.css?inline";

export interface DistributedCallbacks {
  onFilterChange: (state: FilterState) => void;
  onQueryBuilderApply: (excludeTokens: string[]) => void;
  onAmazonOnly: () => void;
}

/** All widgets injected into the sidebar, for cleanup. */
let injectedWidgets: HTMLElement[] = [];
/** Amazon brand section we enhanced (for cleanup of injected elements). */
let enhancedBrandSection: Element | null = null;

/**
 * Remove all previously injected distributed widgets from the DOM.
 */
export function cleanupDistributedFilters(): void {
  for (const w of injectedWidgets) {
    w.remove();
  }
  injectedWidgets = [];

  // Clean up elements injected into Amazon's brand section
  if (enhancedBrandSection) {
    enhancedBrandSection.querySelectorAll(".bas-brand-exclude-btn").forEach((el) => el.remove());
    enhancedBrandSection.querySelectorAll(".bas-brand-controls").forEach((el) => el.remove());
    enhancedBrandSection.querySelectorAll(".bas-brand-item-excluded").forEach((el) => {
      el.classList.remove("bas-brand-item-excluded");
    });
    enhancedBrandSection = null;
  }
}

/**
 * Create and inject distributed filter widgets into Amazon's sidebar.
 * Returns the "main" widget host (used for stats / prefetch status updates).
 */
export function createDistributedFilters(
  initialState: FilterState,
  callbacks: DistributedCallbacks,
  sidebar: Element,
): HTMLElement {
  cleanupDistributedFilters();

  // ── Locate Amazon sidebar sections by heading text ─────────────────
  const reviewSection = findSidebarSection(sidebar, /^Customer\s*Reviews?$/i);
  const priceSection = findSidebarSection(sidebar, /^Price$/i);
  const brandSection = findSidebarSection(sidebar, /^Brands?$/i);

  // ── Shared mutable state ───────────────────────────────────────────
  // Each widget writes to this; emitChange reads from it.
  const state: FilterState = { ...initialState };

  // ── All input references for emitChange to read ────────────────────
  const refs: WidgetRefs = {} as WidgetRefs;

  function emitChange(): void {
    gatherState(refs, state);
    callbacks.onFilterChange({ ...state });
  }

  // ── 1. Main "Better Search" widget (top of sidebar) ────────────────
  const mainWidget = createWidget("🔍 Better Search", (container) => {
    // Hide Sponsored
    const sponsoredGroup = wGroup("Hide Sponsored:", "Hide all sponsored and ad products including the top carousel");
    refs.sponsoredCb = wCheckbox(initialState.hideSponsored, emitChange);
    sponsoredGroup.appendChild(refs.sponsoredCb);
    container.appendChild(sponsoredGroup);

    // Exclude Keywords
    const excludeGroup = wGroup("Exclude Keywords:", "Hide products whose titles contain any of these words (comma-separated)");
    refs.excludeTextarea = document.createElement("textarea");
    refs.excludeTextarea.className = "bas-w-textarea";
    refs.excludeTextarea.placeholder = "word1, word2, ...";
    refs.excludeTextarea.value = initialState.excludeTokens.join(", ");
    refs.excludeTextarea.addEventListener("change", emitChange);
    excludeGroup.appendChild(refs.excludeTextarea);
    container.appendChild(excludeGroup);

    // Dedup Variants
    const dedupGroup = wGroup("Dedup Variants:", "Hide duplicate product variants (e.g. same item in different colors). Keeps the variant with the most reviews.");
    refs.dedupCheckboxes = new Map();
    const dedupToggle = wToggleButton("Variants", initialState.dedupCategories.length);
    const dedupContainer = document.createElement("div");
    dedupContainer.className = "bas-w-expandable";
    dedupContainer.style.display = "none";

    for (const cat of DEDUP_CATEGORIES) {
      const { wrapper, cb } = wLabeledCheckbox(
        `${cat.icon} ${cat.label}`,
        initialState.dedupCategories.includes(cat.id),
        () => {
          const count = Array.from(refs.dedupCheckboxes.values()).filter((c) => c.checked).length;
          updateToggleText(dedupToggle, "Variants", count);
          emitChange();
        },
      );
      refs.dedupCheckboxes.set(cat.id, cb);
      dedupContainer.appendChild(wrapper);
    }

    dedupToggle.addEventListener("click", () => {
      toggleExpand(dedupToggle, dedupContainer, "Variants", refs.dedupCheckboxes);
    });

    dedupGroup.append(dedupToggle, dedupContainer);
    container.appendChild(dedupGroup);

    // Pages
    const pagesGroup = wGroup("Pages:", "How many pages of results to view at once. Additional pages are fetched in the background.");
    refs.pagesSelect = document.createElement("select");
    refs.pagesSelect.className = "bas-w-select";
    for (let n = 1; n <= 10; n++) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = n === 1 ? "1 page" : `${n} pages`;
      if (n === initialState.totalPages) opt.selected = true;
      refs.pagesSelect.appendChild(opt);
    }
    refs.pagesSelect.addEventListener("change", emitChange);
    pagesGroup.appendChild(refs.pagesSelect);

    const prefetchStatus = document.createElement("span");
    prefetchStatus.className = "bas-w-status";
    prefetchStatus.id = "bas-prefetch-status";
    pagesGroup.appendChild(prefetchStatus);
    container.appendChild(pagesGroup);

    // Quick actions
    const actionsGroup = wGroup("", "");
    const sellerBtn = wButton("Amazon Only", "Show only products sold by Amazon", () => callbacks.onAmazonOnly());
    actionsGroup.append(sellerBtn);
    container.appendChild(actionsGroup);

    // Sort
    const sortGroup = wGroup("Sort Results:", "Re-sort visible products on this page. This sorts within current results, not all of Amazon.");
    refs.sortSelect = document.createElement("select");
    refs.sortSelect.className = "bas-w-select";
    const sortOptions: [string, string][] = [
      ["default", "Amazon Default"],
      ["reviews", "Most Reviews"],
      ["value", "Best Value (rating × reviews / price)"],
      ["trending", "Trending (popular + high rated)"],
      ["deal-score", "Best Deals"],
      ["price-low", "Price: Low → High"],
      ["price-high", "Price: High → Low"],
    ];
    for (const [val, label] of sortOptions) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      if (val === initialState.sortBy) opt.selected = true;
      refs.sortSelect.appendChild(opt);
    }
    refs.sortSelect.addEventListener("change", emitChange);
    sortGroup.appendChild(refs.sortSelect);

    const sortNote = document.createElement("div");
    sortNote.style.cssText = "font-size:10px;color:#888;margin-top:2px;";
    sortNote.id = "bas-sort-note";
    sortGroup.appendChild(sortNote);
    container.appendChild(sortGroup);

    // Query Builder
    const qbGroup = wGroup("Query Builder:", "Apply exclude keywords as -term modifiers in the Amazon search box");
    refs.qbCb = wCheckbox(initialState.queryBuilder, emitChange);
    const qbApply = wButton("Apply to Search", "Add exclusions to search box", () => {
      callbacks.onQueryBuilderApply(parseTokens(refs.excludeTextarea.value));
    });
    qbGroup.append(refs.qbCb, qbApply);
    container.appendChild(qbGroup);

    // Stats
    const statsEl = document.createElement("div");
    statsEl.className = "bas-w-stats";
    statsEl.id = "bas-stats";
    container.appendChild(statsEl);
  });

  sidebar.prepend(mainWidget);
  injectedWidgets.push(mainWidget);

  // ── 2. Reviews & Rating widget (after Customer Review section) ─────
  const reviewWidget = createWidget("⭐ Review Filters", (container) => {
    // Min Rating
    const ratingGroup = wGroup("Min Rating:", "Hide products rated below this value");
    refs.ratingInput = wNumberInput(
      initialState.minRating !== null ? String(initialState.minRating) : "",
      { min: "0", max: "5", step: "0.5", placeholder: "Any" },
      emitChange,
    );
    refs.ratingInput.style.width = "55px";
    ratingGroup.appendChild(refs.ratingInput);
    container.appendChild(ratingGroup);

    // Min Reviews
    const reviewGroup = wGroup("Min Reviews:", "Hide products with fewer reviews than this");
    refs.reviewSlider = wRangeInput("0", "50000", "100", String(initialState.minReviews), () => {
      refs.reviewNumberInput.value = refs.reviewSlider.value;
      emitChange();
    });
    refs.reviewNumberInput = wNumberInput(
      String(initialState.minReviews),
      { min: "0", max: "50000", placeholder: "0" },
      () => {
        refs.reviewSlider.value = refs.reviewNumberInput.value;
        emitChange();
      },
    );
    reviewGroup.append(refs.reviewSlider, refs.reviewNumberInput);
    container.appendChild(reviewGroup);

    // Review Quality
    const qualityGroup = wGroup("Review Quality:", "Minimum review authenticity score (0 = off). Analyzes histograms, text patterns, and temporal anomalies.");
    refs.qualitySlider = wRangeInput("0", "100", "5", String(initialState.minReviewQuality), () => {
      refs.qualityNumberInput.value = refs.qualitySlider.value;
      emitChange();
    });
    refs.qualityNumberInput = wNumberInput(
      String(initialState.minReviewQuality),
      { min: "0", max: "100", placeholder: "0" },
      () => {
        refs.qualitySlider.value = refs.qualityNumberInput.value;
        emitChange();
      },
    );
    refs.qualityNumberInput.style.width = "45px";
    qualityGroup.append(refs.qualitySlider, refs.qualityNumberInput);
    container.appendChild(qualityGroup);

    // AI Analysis
    const mlGroup = wGroup("🤖 AI Analysis:", "Use ML sentiment analysis (distilBERT) to detect rating mismatches. Downloads ~27 MB model on first use.");
    refs.mlCb = wCheckbox(initialState.useMLAnalysis ?? false, emitChange);
    mlGroup.appendChild(refs.mlCb);
    container.appendChild(mlGroup);

    // Ignore Review Categories
    const catGroup = wGroup("Ignore Categories:", "Exclude reviews about non-product issues (shipping, packaging, etc.) from the rating");
    refs.categoryCheckboxes = new Map();
    const catToggle = wToggleButton("Categories", initialState.ignoredCategories.length);
    const catContainer = document.createElement("div");
    catContainer.className = "bas-w-expandable";
    catContainer.style.display = "none";

    for (const cat of REVIEW_CATEGORIES.filter((c) => !c.isProductRelated)) {
      const { wrapper, cb } = wLabeledCheckbox(
        `${cat.icon} ${cat.label}`,
        initialState.ignoredCategories.includes(cat.id),
        () => {
          const count = Array.from(refs.categoryCheckboxes.values()).filter((c) => c.checked).length;
          updateToggleText(catToggle, "Categories", count);
          emitChange();
        },
      );
      refs.categoryCheckboxes.set(cat.id, cb);
      catContainer.appendChild(wrapper);
    }

    catToggle.addEventListener("click", () => {
      toggleExpand(catToggle, catContainer, "Categories", refs.categoryCheckboxes);
    });

    catGroup.append(catToggle, catContainer);
    container.appendChild(catGroup);
  });

  injectAfterSection(reviewSection, reviewWidget, sidebar);
  injectedWidgets.push(reviewWidget);

  // ── 3. Price widget (after Price section) ──────────────────────────
  const priceWidget = createWidget("💰 Price Range", (container) => {
    const priceGroup = wGroup("Precise Range:", "Filter by exact price range");
    refs.priceMin = wNumberInput(
      initialState.priceMin !== null ? String(initialState.priceMin) : "",
      { min: "0", step: "1", placeholder: "Min $" },
      emitChange,
    );
    refs.priceMin.style.width = "60px";
    const dash = document.createElement("span");
    dash.textContent = " – ";
    dash.style.color = "#565959";
    refs.priceMax = wNumberInput(
      initialState.priceMax !== null ? String(initialState.priceMax) : "",
      { min: "0", step: "1", placeholder: "Max $" },
      emitChange,
    );
    refs.priceMax.style.width = "60px";
    priceGroup.append(refs.priceMin, dash, refs.priceMax);
    container.appendChild(priceGroup);
  });

  injectAfterSection(priceSection, priceWidget, sidebar);
  injectedWidgets.push(priceWidget);

  // ── 4. Brand: enhance Amazon's native section ──────────────────────
  // Instead of a separate widget, inject exclude buttons + mode dropdown
  // directly into Amazon's existing Brand section for a unified UX.
  refs.excludedBrands = new Set(initialState.excludedBrands ?? []);
  refs.brandSelect = document.createElement("select"); // created below inside enhanceBrandSection

  if (brandSection) {
    enhanceBrandSection(brandSection, refs, initialState, emitChange);
    enhancedBrandSection = brandSection;
  } else {
    // Fallback: create a minimal brand widget if Amazon's section not found
    const brandWidget = createWidget("🏷️ Brand Filters", (container) => {
      const modeGroup = wGroup("Mode:", "Filter by brand trust level");
      refs.brandSelect = buildBrandModeSelect(initialState.brandMode, emitChange);
      modeGroup.appendChild(refs.brandSelect);
      container.appendChild(modeGroup);

      const excludeGroup = wGroup("Exclude Brands:", "Click brand names below or type comma-separated brand names to always hide");
      refs.excludeBrandsInput = document.createElement("textarea");
      refs.excludeBrandsInput.className = "bas-w-textarea";
      refs.excludeBrandsInput.placeholder = "BrandA, BrandB, ...";
      refs.excludeBrandsInput.value = (initialState.excludedBrands ?? []).join(", ");
      refs.excludeBrandsInput.addEventListener("change", () => {
        refs.excludedBrands = new Set(parseTokens(refs.excludeBrandsInput!.value));
        emitChange();
      });
      excludeGroup.appendChild(refs.excludeBrandsInput);
      container.appendChild(excludeGroup);
    });
    injectAfterSection(null, brandWidget, sidebar);
    injectedWidgets.push(brandWidget);
  }

  // ── 5. Seller filter widget ───────────────────────────────────────
  const sellerWidget = createWidget("🏪 Seller Filter", (container) => {
    const sellerGroup = wGroup("Sold By:", "Filter by seller/fulfillment (loaded from product pages)");
    refs.sellerSelect = document.createElement("select");
    refs.sellerSelect.className = "bas-w-select";
    const sellerOptions: [string, string][] = [
      ["any", "Any Seller"],
      ["amazon", "Amazon Only"],
      ["fba", "Amazon + FBA"],
      ["third-party", "Third-Party Only"],
    ];
    for (const [val, label] of sellerOptions) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      if (val === initialState.sellerFilter) opt.selected = true;
      refs.sellerSelect.appendChild(opt);
    }
    refs.sellerSelect.addEventListener("change", emitChange);
    sellerGroup.appendChild(refs.sellerSelect);
    container.appendChild(sellerGroup);
  });

  // Place after brand section or at end of sidebar
  injectAfterSection(enhancedBrandSection ?? null, sellerWidget, sidebar);
  injectedWidgets.push(sellerWidget);

  return mainWidget;
}

/**
 * Update the stats display in the main distributed widget.
 */
export function updateDistributedStats(
  host: HTMLElement,
  shown: number,
  total: number,
): void {
  const shadow = host.shadowRoot;
  if (!shadow) return;
  const el = shadow.getElementById("bas-stats");
  if (el) el.textContent = `Showing ${shown} of ${total}`;
}

/**
 * Update the processing state indicator in the main distributed widget.
 */
export function updateProcessingState(host: HTMLElement, state: "processing" | "done", detail?: string): void {
  const shadow = host.shadowRoot;
  if (!shadow) return;
  const el = shadow.getElementById("bas-stats");
  if (!el) return;

  if (state === "processing") {
    el.textContent = detail ?? "⏳ Processing filters...";
    el.style.color = "#c45500"; // Amazon orange
  } else {
    el.style.color = ""; // Reset to default
    // The stats text will be updated by updateDistributedStats
  }
}

/**
 * Update the prefetch status text in the main distributed widget.
 */
export function updateDistributedPrefetchStatus(host: HTMLElement, text: string): void {
  const shadow = host.shadowRoot;
  if (!shadow) return;
  const el = shadow.getElementById("bas-prefetch-status");
  if (el) el.textContent = text;
}

/**
 * Update the sort note showing how many products were sorted.
 */
export function updateSortNote(host: HTMLElement, sortBy: string, visibleCount: number): void {
  const shadow = host.shadowRoot;
  if (!shadow) return;
  const el = shadow.getElementById("bas-sort-note");
  if (!el) return;
  if (sortBy === "default") {
    el.textContent = "";
  } else {
    el.textContent = `⚠️ Sorted within current page (${visibleCount} visible products)`;
  }
}

// ── Sidebar section detection ─────────────────────────────────────────

/**
 * Find an Amazon sidebar section by its heading text.
 * Returns the section container element, or null if not found.
 *
 * Amazon sidebar sections have headings with class `a-text-bold` or
 * `a-size-base` inside a `div.a-section` container.
 */
function findSidebarSection(sidebar: Element, pattern: RegExp): Element | null {
  // Strategy 1: Headings with common Amazon classes
  const headings = sidebar.querySelectorAll(
    "span.a-text-bold, span.a-size-base.a-color-base, [id*='Refinements'] > div > span",
  );

  for (const heading of headings) {
    const text = heading.textContent?.trim() || "";
    if (pattern.test(text)) {
      // Walk up to find the section container
      const section =
        heading.closest("div.a-section") ||
        heading.closest('[class*="refinement"]') ||
        heading.parentElement;
      return section;
    }
  }

  // Strategy 2: ID-based (e.g., #brandsRefinements, #priceRefinements)
  const idMap: Record<string, string> = {
    "Brand": "brandsRefinements",
    "Price": "priceRefinements",
    "Customer Review": "reviewsRefinements",
    "Department": "departmentRefinements",
  };
  for (const [key, id] of Object.entries(idMap)) {
    if (pattern.test(key)) {
      const el = sidebar.querySelector(`#${id}`);
      if (el) return el;
    }
  }

  return null;
}

/**
 * Inject a widget after an Amazon section. Falls back to appending to sidebar.
 */
function injectAfterSection(section: Element | null, widget: HTMLElement, sidebar: Element): void {
  if (section) {
    section.after(widget);
  } else {
    // Fallback: append after the main widget (first child of sidebar)
    const mainWidget = sidebar.querySelector("#bas-widget-main");
    if (mainWidget) {
      mainWidget.after(widget);
    } else {
      sidebar.prepend(widget);
    }
  }
}

// ── Widget creation helpers ───────────────────────────────────────────

/**
 * Create a widget host element with Shadow DOM.
 */
function createWidget(
  title: string,
  buildContent: (container: HTMLElement) => void,
): HTMLElement {
  const host = document.createElement("div");
  host.className = "bas-sidebar-widget-host";
  if (title.includes("Better Search")) {
    host.id = "bas-widget-main";
  }

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = sidebarWidgetStyles;
  shadow.appendChild(style);

  const container = document.createElement("div");
  container.className = "bas-widget";

  // Widget heading
  const heading = document.createElement("div");
  heading.className = "bas-widget__heading";
  heading.textContent = title;
  container.appendChild(heading);

  buildContent(container);

  shadow.appendChild(container);
  return host;
}

// ── State management ──────────────────────────────────────────────────

interface WidgetRefs {
  // Main widget
  sponsoredCb: HTMLInputElement;
  excludeTextarea: HTMLTextAreaElement;
  dedupCheckboxes: Map<string, HTMLInputElement>;
  pagesSelect: HTMLSelectElement;
  qbCb: HTMLInputElement;
  sortSelect: HTMLSelectElement;
  // Review widget
  ratingInput: HTMLInputElement;
  reviewSlider: HTMLInputElement;
  reviewNumberInput: HTMLInputElement;
  qualitySlider: HTMLInputElement;
  qualityNumberInput: HTMLInputElement;
  mlCb: HTMLInputElement;
  categoryCheckboxes: Map<string, HTMLInputElement>;
  // Price widget
  priceMin: HTMLInputElement;
  priceMax: HTMLInputElement;
  // Brand (integrated into Amazon's section)
  brandSelect: HTMLSelectElement;
  sellerSelect: HTMLSelectElement;
  excludedBrands: Set<string>;
  excludeBrandsInput?: HTMLTextAreaElement; // fallback only
}

function gatherState(refs: WidgetRefs, state: FilterState): void {
  state.hideSponsored = refs.sponsoredCb?.checked ?? state.hideSponsored;
  state.excludeTokens = refs.excludeTextarea ? parseTokens(refs.excludeTextarea.value) : state.excludeTokens;
  state.dedupCategories = refs.dedupCheckboxes
    ? Array.from(refs.dedupCheckboxes.entries()).filter(([_, cb]) => cb.checked).map(([id]) => id)
    : state.dedupCategories;
  state.totalPages = refs.pagesSelect
    ? Math.min(10, Math.max(1, parseInt(refs.pagesSelect.value, 10) || 1))
    : state.totalPages;
  state.queryBuilder = refs.qbCb?.checked ?? state.queryBuilder;
  state.minRating = refs.ratingInput?.value ? parseFloat(refs.ratingInput.value) : null;
  state.minReviews = refs.reviewNumberInput ? parseInt(refs.reviewNumberInput.value, 10) || 0 : state.minReviews;
  state.minReviewQuality = refs.qualityNumberInput ? parseInt(refs.qualityNumberInput.value, 10) || 0 : state.minReviewQuality;
  state.useMLAnalysis = refs.mlCb?.checked ?? state.useMLAnalysis;
  state.ignoredCategories = refs.categoryCheckboxes
    ? Array.from(refs.categoryCheckboxes.entries()).filter(([_, cb]) => cb.checked).map(([id]) => id)
    : state.ignoredCategories;
  state.priceMin = refs.priceMin?.value ? parseFloat(refs.priceMin.value) : null;
  state.priceMax = refs.priceMax?.value ? parseFloat(refs.priceMax.value) : null;
  state.brandMode = (refs.brandSelect?.value as BrandMode) ?? state.brandMode;
  state.sellerFilter = (refs.sellerSelect?.value as SellerFilter) ?? state.sellerFilter;
  state.sortBy = (refs.sortSelect?.value as FilterState["sortBy"]) ?? state.sortBy;

  // Collect excluded brands from the integrated UI or fallback textarea
  const excluded: string[] = [];
  if (refs.excludedBrands?.size) {
    excluded.push(...refs.excludedBrands);
  }
  if (refs.excludeBrandsInput?.value.trim()) {
    for (const b of parseTokens(refs.excludeBrandsInput.value)) {
      if (!excluded.includes(b)) excluded.push(b);
    }
  }
  state.excludedBrands = excluded;
}

// ── DOM element factories ─────────────────────────────────────────────

function wGroup(label: string, tooltip: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "bas-w-group";
  if (tooltip) el.title = tooltip;
  if (label) {
    const lbl = document.createElement("label");
    lbl.className = "bas-w-label";
    lbl.textContent = label;
    el.appendChild(lbl);
  }
  return el;
}

function wCheckbox(checked: boolean, onChange: () => void): HTMLInputElement {
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "bas-w-checkbox";
  cb.checked = checked;
  cb.addEventListener("change", onChange);
  return cb;
}

function wNumberInput(
  value: string,
  attrs: Record<string, string>,
  onChange: () => void,
): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "number";
  el.className = "bas-w-number";
  el.value = value;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.addEventListener("change", onChange);
  return el;
}

function wRangeInput(
  min: string,
  max: string,
  step: string,
  value: string,
  onInput: () => void,
): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "range";
  el.className = "bas-w-range";
  el.min = min;
  el.max = max;
  el.step = step;
  el.value = value;
  el.addEventListener("input", onInput);
  return el;
}

function wButton(text: string, tooltip: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "bas-w-btn";
  btn.textContent = text;
  btn.title = tooltip;
  btn.addEventListener("click", onClick);
  return btn;
}

function wToggleButton(label: string, activeCount: number): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "bas-w-btn bas-w-toggle";
  btn.textContent = `▸ ${label} (${activeCount} active)`;
  return btn;
}

function wLabeledCheckbox(
  label: string,
  checked: boolean,
  onChange: () => void,
): { wrapper: HTMLElement; cb: HTMLInputElement } {
  const wrapper = document.createElement("label");
  wrapper.className = "bas-w-labeled-cb";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "bas-w-checkbox";
  cb.checked = checked;
  cb.addEventListener("change", onChange);
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(cb, text);
  return { wrapper, cb };
}

function toggleExpand(
  toggle: HTMLButtonElement,
  container: HTMLElement,
  label: string,
  checkboxes: Map<string, HTMLInputElement>,
): void {
  const collapsed = container.style.display === "none";
  container.style.display = collapsed ? "flex" : "none";
  const count = Array.from(checkboxes.values()).filter((c) => c.checked).length;
  toggle.textContent = `${collapsed ? "▾" : "▸"} ${label} (${count} active)`;
}

function updateToggleText(toggle: HTMLButtonElement, label: string, count: number): void {
  const expanded = toggle.textContent?.startsWith("▾");
  toggle.textContent = `${expanded ? "▾" : "▸"} ${label} (${count} active)`;
}

function parseTokens(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// ── Amazon Brand Section Enhancement ──────────────────────────────────

/** CSS injected into the page (not Shadow DOM) to style brand exclude buttons. */
const BRAND_ENHANCE_STYLES = `
  .bas-brand-exclude-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: #949494;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    margin-left: 4px;
    padding: 0;
    vertical-align: middle;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .bas-brand-exclude-btn:hover {
    background: #fdd;
    border-color: #c44;
    color: #c44;
  }
  .bas-brand-exclude-btn.bas-excluded {
    background: #c44;
    border-color: #a33;
    color: #fff;
  }
  .bas-brand-exclude-btn.bas-excluded:hover {
    background: #a33;
  }
  .bas-brand-item-excluded > a,
  .bas-brand-item-excluded > span {
    text-decoration: line-through;
    opacity: 0.5;
  }
  .bas-brand-controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0 4px;
    border-top: 1px solid #e8d5a3;
    margin-top: 6px;
  }
  .bas-brand-controls label {
    font-size: 11px;
    font-weight: 600;
    color: #565959;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .bas-brand-controls select {
    width: 100%;
    box-sizing: border-box;
    padding: 4px 6px;
    border: 1px solid #a2a6ac;
    border-radius: 4px;
    font-size: 12px;
    background: #fff;
  }
  .bas-brand-controls select:focus {
    border-color: #ff9900;
    outline: none;
  }
  .bas-brand-excluded-summary {
    font-size: 11px;
    color: #c45500;
    padding: 4px 0;
    cursor: pointer;
  }
  .bas-brand-excluded-summary:hover {
    text-decoration: underline;
  }
`;

/** Inject brand enhancement styles into the page head (idempotent). */
function ensureBrandStyles(): void {
  const id = "bas-brand-enhance-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = BRAND_ENHANCE_STYLES;
  document.head.appendChild(style);
}

/** Build the brand mode <select> dropdown. */
function buildBrandModeSelect(currentMode: BrandMode, onChange: () => void): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = "bas-w-select";
  const options: [BrandMode, string][] = [
    ["off", "Off"],
    ["dim", "Dim Unknown"],
    ["hide", "Hide Suspicious"],
    ["trusted-only", "Trusted Only"],
  ];
  for (const [val, label] of options) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    if (val === currentMode) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", onChange);
  return select;
}

/**
 * Extract brand name from an Amazon sidebar brand list item.
 * Amazon brand items are typically <li> elements containing <a> links
 * with a checkbox icon and brand text in a <span>.
 */
function extractBrandName(item: Element): string | null {
  // Try aria-label on the link (often "Brand Name")
  const link = item.querySelector("a");
  if (link?.ariaLabel) return link.ariaLabel.trim();

  // Try the text content of spans (skip checkbox icons)
  const spans = item.querySelectorAll("span.a-size-base");
  for (const span of spans) {
    const text = span.textContent?.trim();
    if (text && text.length > 1 && !text.includes("checkbox")) return text;
  }

  // Fallback: use visible text content, stripped of leading checkbox char
  const text = item.textContent?.trim().replace(/^[\s✓☐☑✔]+/, "").trim();
  return text && text.length > 1 ? text : null;
}

/**
 * Enhance Amazon's native Brand sidebar section with exclude buttons.
 * Injects a small ✕ button next to each brand name. Clicking it toggles
 * exclusion for that brand. Also appends a brand mode dropdown at the bottom.
 */
function enhanceBrandSection(
  section: Element,
  refs: WidgetRefs,
  initialState: FilterState,
  emitChange: () => void,
): void {
  ensureBrandStyles();

  // Find all brand list items in Amazon's section
  const brandItems = section.querySelectorAll("li");

  for (const item of brandItems) {
    const brandName = extractBrandName(item);
    if (!brandName) continue;

    // Skip if we already enhanced this item
    if (item.querySelector(".bas-brand-exclude-btn")) continue;

    const btn = document.createElement("button");
    btn.className = "bas-brand-exclude-btn";
    btn.textContent = "✕";
    btn.title = `Exclude "${brandName}"`;

    if (refs.excludedBrands.has(brandName.toLowerCase())) {
      btn.classList.add("bas-excluded");
      btn.title = `Stop excluding "${brandName}"`;
      item.classList.add("bas-brand-item-excluded");
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = brandName.toLowerCase();
      if (refs.excludedBrands.has(key)) {
        refs.excludedBrands.delete(key);
        btn.classList.remove("bas-excluded");
        btn.title = `Exclude "${brandName}"`;
        item.classList.remove("bas-brand-item-excluded");
      } else {
        refs.excludedBrands.add(key);
        btn.classList.add("bas-excluded");
        btn.title = `Stop excluding "${brandName}"`;
        item.classList.add("bas-brand-item-excluded");
      }
      updateExcludedSummary(section, refs.excludedBrands);
      emitChange();
    });

    // Insert the button at the end of the list item
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.appendChild(btn);
  }

  // Add our controls at the bottom of Amazon's section
  if (!section.querySelector(".bas-brand-controls")) {
    const controls = document.createElement("div");
    controls.className = "bas-brand-controls";

    // Brand mode dropdown
    const modeLabel = document.createElement("label");
    modeLabel.textContent = "Trust filter:";
    modeLabel.title = "Filter by brand trust level (dim, hide, or show only trusted brands)";
    refs.brandSelect = buildBrandModeSelect(initialState.brandMode, emitChange);
    controls.append(modeLabel, refs.brandSelect);

    // Excluded summary
    const summary = document.createElement("div");
    summary.className = "bas-brand-excluded-summary";
    summary.id = "bas-brand-excluded-summary";
    updateExcludedSummaryEl(summary, refs.excludedBrands);
    summary.title = "Click to clear all excluded brands";
    summary.addEventListener("click", () => {
      refs.excludedBrands.clear();
      // Reset all exclude buttons
      section.querySelectorAll(".bas-brand-exclude-btn.bas-excluded").forEach((b) => {
        b.classList.remove("bas-excluded");
        b.parentElement?.classList.remove("bas-brand-item-excluded");
      });
      updateExcludedSummary(section, refs.excludedBrands);
      emitChange();
    });
    controls.appendChild(summary);

    section.appendChild(controls);
  }
}

function updateExcludedSummaryEl(el: HTMLElement, excluded: Set<string>): void {
  if (excluded.size === 0) {
    el.textContent = "Click ✕ next to a brand to exclude it";
    el.style.color = "#565959";
  } else {
    el.textContent = `${excluded.size} brand${excluded.size > 1 ? "s" : ""} excluded (click to clear)`;
    el.style.color = "#c45500";
  }
}

function updateExcludedSummary(section: Element, excluded: Set<string>): void {
  const el = section.querySelector("#bas-brand-excluded-summary") as HTMLElement | null;
  if (el) updateExcludedSummaryEl(el, excluded);
}
