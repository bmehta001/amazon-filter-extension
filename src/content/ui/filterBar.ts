import type { FilterState, BrandMode, SellerFilter } from "../../types";
import { DEFAULT_FILTERS } from "../../types";
import filterBarStyles from "./filterBar.css?inline";
import { REVIEW_CATEGORIES } from "../../review/categories";
import { DEDUP_CATEGORIES } from "../dedup";

export interface FilterBarCallbacks {
  onFilterChange: (state: FilterState) => void;
  onQueryBuilderApply: (excludeTokens: string[]) => void;
  onAmazonOnly: () => void;
}

/**
 * Create the filter panel as a horizontal bar above results.
 * Uses Shadow DOM for style isolation.
 *
 * This is used as the fallback when no sidebar is available (Haul pages,
 * narrow layouts). When a sidebar IS available, the distributed widget
 * system in sidebarWidgets.ts is used instead.
 */
export function createFilterBar(
  initialState: FilterState,
  callbacks: FilterBarCallbacks,
): HTMLElement {
  const host = document.createElement("div");
  host.id = "bas-filter-bar-host";

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = filterBarStyles;
  shadow.appendChild(style);

  const bar = document.createElement("div");
  bar.className = "bas-filter-bar";

  // Title
  const title = document.createElement("span");
  title.className = "bas-filter-bar__title";
  title.textContent = "🔍 Better Filters";
  bar.appendChild(title);

  bar.appendChild(sep());

  // ── Min Reviews ────────────────────────────────────────────────────
  const reviewGroup = group("Min Reviews:");
  reviewGroup.title = "Hide products with fewer reviews than this threshold";
  const reviewSlider = input("range", {
    min: "0",
    max: "50000",
    step: "100",
    value: String(initialState.minReviews),
  });
  const reviewInput = input("number", {
    min: "0",
    max: "50000",
    value: String(initialState.minReviews),
    placeholder: "0",
  });
  reviewSlider.addEventListener("input", () => {
    reviewInput.value = reviewSlider.value;
    emitChange();
  });
  reviewInput.addEventListener("change", () => {
    reviewSlider.value = reviewInput.value;
    emitChange();
  });
  reviewGroup.append(reviewSlider, reviewInput);
  bar.appendChild(reviewGroup);

  bar.appendChild(sep());

  // ── Min Rating ─────────────────────────────────────────────────────
  const ratingGroup = group("Min Rating:");
  ratingGroup.title = "Hide products rated below this value (uses adjusted rating when categories are ignored)";
  const ratingInput = input("number", {
    min: "0",
    max: "5",
    step: "0.5",
    value: initialState.minRating !== null ? String(initialState.minRating) : "",
    placeholder: "Any",
  });
  ratingInput.style.width = "50px";
  ratingInput.addEventListener("change", emitChange);
  ratingGroup.appendChild(ratingInput);
  bar.appendChild(ratingGroup);

  bar.appendChild(sep());

  // ── Price Range ────────────────────────────────────────────────────
  const priceGroup = group("Price:");
  priceGroup.title = "Filter by price range in the local currency";
  const priceMin = input("number", {
    min: "0",
    step: "1",
    value: initialState.priceMin !== null ? String(initialState.priceMin) : "",
    placeholder: "Min",
  });
  priceMin.style.width = "55px";
  const priceDash = document.createElement("span");
  priceDash.textContent = "–";
  const priceMax = input("number", {
    min: "0",
    step: "1",
    value: initialState.priceMax !== null ? String(initialState.priceMax) : "",
    placeholder: "Max",
  });
  priceMax.style.width = "55px";
  priceMin.addEventListener("change", emitChange);
  priceMax.addEventListener("change", emitChange);
  priceGroup.append(priceMin, priceDash, priceMax);
  bar.appendChild(priceGroup);

  bar.appendChild(sep());

  // ── Exclude Keywords ───────────────────────────────────────────────
  const excludeGroup = group("Exclude:");
  excludeGroup.title = "Hide products whose titles contain any of these words (comma-separated)";
  const excludeTextarea = document.createElement("textarea");
  excludeTextarea.placeholder = "word1, word2, ...";
  excludeTextarea.value = initialState.excludeTokens.join(", ");
  excludeTextarea.addEventListener("change", emitChange);
  excludeGroup.appendChild(excludeTextarea);
  bar.appendChild(excludeGroup);

  bar.appendChild(sep());

  // ── Brand Mode ─────────────────────────────────────────────────────
  const brandGroup = group("Brands:");
  brandGroup.title = "Filter by brand trust: dim unknown brands, hide suspicious ones, or show only trusted brands from a curated 3,000+ allowlist";
  const brandSelect = document.createElement("select");
  const brandOptions: [BrandMode, string][] = [
    ["off", "Off"],
    ["dim", "Dim Unknown"],
    ["hide", "Hide Suspicious"],
    ["trusted-only", "Trusted Only"],
  ];
  for (const [val, label] of brandOptions) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    if (val === initialState.brandMode) opt.selected = true;
    brandSelect.appendChild(opt);
  }
  brandSelect.addEventListener("change", emitChange);
  brandGroup.appendChild(brandSelect);
  bar.appendChild(brandGroup);

  bar.appendChild(sep());

  // ── Seller Filter ─────────────────────────────────────────────────
  const sellerGroup = group("Seller:");
  sellerGroup.title = "Filter by seller/fulfillment type (data loaded from product pages)";
  const sellerSelect = document.createElement("select");
  const sellerOptions: [SellerFilter, string][] = [
    ["any", "Any Seller"],
    ["amazon", "Amazon Only"],
    ["fba", "Amazon + FBA"],
    ["third-party", "Third-Party"],
  ];
  for (const [val, label] of sellerOptions) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    if (val === initialState.sellerFilter) opt.selected = true;
    sellerSelect.appendChild(opt);
  }
  sellerSelect.addEventListener("change", emitChange);
  sellerGroup.appendChild(sellerSelect);
  bar.appendChild(sellerGroup);

  bar.appendChild(sep());

  // ── Hide Sponsored ─────────────────────────────────────────────────
  const sponsoredGroup = group("Hide Sponsored:");
  sponsoredGroup.title = "Hide all sponsored/ad products including the top carousel";
  const sponsoredCb = document.createElement("input");
  sponsoredCb.type = "checkbox";
  sponsoredCb.checked = initialState.hideSponsored;
  sponsoredCb.addEventListener("change", emitChange);
  sponsoredGroup.appendChild(sponsoredCb);
  bar.appendChild(sponsoredGroup);

  bar.appendChild(sep());

  // ── Review Quality ─────────────────────────────────────────────────
  const qualityGroup = group("Review Quality:");
  qualityGroup.title =
    "Minimum review authenticity score (0 = off, 100 = only show products with fully authentic reviews). Analyzes rating histograms, text patterns, and temporal anomalies.";
  const qualitySlider = input("range", {
    min: "0",
    max: "100",
    step: "5",
    value: String(initialState.minReviewQuality),
  });
  const qualityInput = input("number", {
    min: "0",
    max: "100",
    value: String(initialState.minReviewQuality),
    placeholder: "0",
  });
  qualityInput.style.width = "45px";
  qualitySlider.addEventListener("input", () => {
    qualityInput.value = qualitySlider.value;
    emitChange();
  });
  qualityInput.addEventListener("change", () => {
    qualitySlider.value = qualityInput.value;
    emitChange();
  });
  qualityGroup.append(qualitySlider, qualityInput);
  bar.appendChild(qualityGroup);

  bar.appendChild(sep());

  // ── AI Analysis ────────────────────────────────────────────────────
  const mlGroup = group("🤖 AI Analysis:");
  mlGroup.title =
    "Use ML sentiment analysis (distilBERT) to detect rating/text mismatches. Downloads a small AI model (~27 MB) on first use.";
  const mlCb = document.createElement("input");
  mlCb.type = "checkbox";
  mlCb.checked = initialState.useMLAnalysis ?? false;
  mlCb.addEventListener("change", emitChange);
  mlGroup.appendChild(mlCb);
  bar.appendChild(mlGroup);

  bar.appendChild(sep());

  // ── Ignore Categories ──────────────────────────────────────────────
  const catGroup = group("Ignore Categories:");
  catGroup.title =
    "Exclude reviews about non-product issues (e.g. shipping, packaging) from the rating calculation";
  const categoryCheckboxes = new Map<string, HTMLInputElement>();

  const catToggle = document.createElement("button");
  catToggle.className = "bas-btn";
  catToggle.textContent = "▸ Categories (0 ignored)";
  catToggle.style.fontSize = "11px";

  const catContainer = document.createElement("div");
  catContainer.style.display = "none";
  catContainer.style.flexDirection = "column";
  catContainer.style.gap = "2px";
  catContainer.style.marginTop = "4px";

  const nonProductCategories = REVIEW_CATEGORIES.filter(
    (c) => !c.isProductRelated,
  );
  for (const cat of nonProductCategories) {
    const wrapper = document.createElement("label");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "4px";
    wrapper.style.fontSize = "11px";
    wrapper.style.cursor = "pointer";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = initialState.ignoredCategories.includes(cat.id);
    cb.addEventListener("change", () => {
      const count = Array.from(categoryCheckboxes.values()).filter(
        (c) => c.checked,
      ).length;
      catToggle.textContent = `${catContainer.style.display === "none" ? "▸" : "▾"} Categories (${count} ignored)`;
      emitChange();
    });
    categoryCheckboxes.set(cat.id, cb);

    const labelText = document.createElement("span");
    labelText.textContent = `${cat.icon} ${cat.label}`;

    wrapper.append(cb, labelText);
    catContainer.appendChild(wrapper);
  }

  catToggle.addEventListener("click", () => {
    const collapsed = catContainer.style.display === "none";
    catContainer.style.display = collapsed ? "flex" : "none";
    const count = Array.from(categoryCheckboxes.values()).filter(
      (c) => c.checked,
    ).length;
    catToggle.textContent = `${collapsed ? "▾" : "▸"} Categories (${count} ignored)`;
  });

  const initialIgnored = Array.from(categoryCheckboxes.values()).filter(
    (c) => c.checked,
  ).length;
  if (initialIgnored > 0) {
    catToggle.textContent = `▸ Categories (${initialIgnored} ignored)`;
  }

  catGroup.append(catToggle, catContainer);
  bar.appendChild(catGroup);

  bar.appendChild(sep());

  // ── Dedup Variants ─────────────────────────────────────────────────
  const dedupGroup = group("Dedup Variants:");
  dedupGroup.title =
    "Hide duplicate product variants (e.g. same item in different colors). Keeps the variant with the most reviews.";
  const dedupCheckboxes = new Map<string, HTMLInputElement>();

  const dedupToggle = document.createElement("button");
  dedupToggle.className = "bas-btn";
  dedupToggle.textContent = "▸ Variants (0 active)";
  dedupToggle.style.fontSize = "11px";

  const dedupContainer = document.createElement("div");
  dedupContainer.style.display = "none";
  dedupContainer.style.flexDirection = "column";
  dedupContainer.style.gap = "2px";
  dedupContainer.style.marginTop = "4px";

  for (const cat of DEDUP_CATEGORIES) {
    const wrapper = document.createElement("label");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "4px";
    wrapper.style.fontSize = "11px";
    wrapper.style.cursor = "pointer";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = initialState.dedupCategories.includes(cat.id);
    cb.addEventListener("change", () => {
      const count = Array.from(dedupCheckboxes.values()).filter(
        (c) => c.checked,
      ).length;
      dedupToggle.textContent = `${dedupContainer.style.display === "none" ? "▸" : "▾"} Variants (${count} active)`;
      emitChange();
    });
    dedupCheckboxes.set(cat.id, cb);

    const labelText = document.createElement("span");
    labelText.textContent = `${cat.icon} ${cat.label}`;

    wrapper.append(cb, labelText);
    dedupContainer.appendChild(wrapper);
  }

  dedupToggle.addEventListener("click", () => {
    const collapsed = dedupContainer.style.display === "none";
    dedupContainer.style.display = collapsed ? "flex" : "none";
    const count = Array.from(dedupCheckboxes.values()).filter(
      (c) => c.checked,
    ).length;
    dedupToggle.textContent = `${collapsed ? "▾" : "▸"} Variants (${count} active)`;
  });

  const initialDedup = Array.from(dedupCheckboxes.values()).filter(
    (c) => c.checked,
  ).length;
  if (initialDedup > 0) {
    dedupToggle.textContent = `▸ Variants (${initialDedup} active)`;
  }

  dedupGroup.append(dedupToggle, dedupContainer);
  bar.appendChild(dedupGroup);

  bar.appendChild(sep());

  // ── Pages selector ─────────────────────────────────────────────────
  const pagesGroup = group("Pages:");
  pagesGroup.title =
    "How many pages of results to view at once. Additional pages are fetched in the background and merged into the current view.";
  const pagesSelect = document.createElement("select");
  for (let n = 1; n <= 10; n++) {
    const opt = document.createElement("option");
    opt.value = String(n);
    opt.textContent = n === 1 ? "1 page" : `${n} pages`;
    if (n === initialState.totalPages) opt.selected = true;
    pagesSelect.appendChild(opt);
  }
  pagesSelect.addEventListener("change", emitChange);
  pagesGroup.appendChild(pagesSelect);

  const prefetchStatus = document.createElement("span");
  prefetchStatus.id = "bas-prefetch-status";
  prefetchStatus.style.fontSize = "11px";
  prefetchStatus.style.marginLeft = "6px";
  pagesGroup.appendChild(prefetchStatus);
  bar.appendChild(pagesGroup);

  bar.appendChild(sep());

  // ── Query Builder ──────────────────────────────────────────────────
  const qbGroup = group("Query Builder:");
  qbGroup.title =
    "When enabled, the Exclude keywords are applied as -term modifiers in the Amazon search box";
  const qbCb = document.createElement("input");
  qbCb.type = "checkbox";
  qbCb.checked = initialState.queryBuilder;
  qbCb.addEventListener("change", emitChange);
  qbGroup.appendChild(qbCb);

  const qbApply = document.createElement("button");
  qbApply.className = "bas-btn";
  qbApply.textContent = "Apply to Search";
  qbApply.addEventListener("click", () => {
    const tokens = parseExcludeTokens(excludeTextarea.value);
    callbacks.onQueryBuilderApply(tokens);
  });
  qbGroup.appendChild(qbApply);
  bar.appendChild(qbGroup);

  bar.appendChild(sep());

  // ── Sort & Seller helpers ──────────────────────────────────────────
  const helpersGroup = group("");
  const sellerBtn = document.createElement("button");
  sellerBtn.className = "bas-btn";
  sellerBtn.textContent = "Amazon Only";
  sellerBtn.title = "Show only products sold and shipped by Amazon";
  sellerBtn.addEventListener("click", () => callbacks.onAmazonOnly());
  helpersGroup.appendChild(sellerBtn);
  bar.appendChild(helpersGroup);

  // Stats display
  const statsEl = document.createElement("span");
  statsEl.className = "bas-stats";
  statsEl.id = "bas-stats";
  bar.appendChild(statsEl);

  shadow.appendChild(bar);

  /** Gather current values and emit a filter change. */
  function emitChange() {
    const state: FilterState = {
      minReviews: parseInt(reviewInput.value, 10) || 0,
      minRating: ratingInput.value ? parseFloat(ratingInput.value) : null,
      priceMin: priceMin.value ? parseFloat(priceMin.value) : null,
      priceMax: priceMax.value ? parseFloat(priceMax.value) : null,
      excludeTokens: parseExcludeTokens(excludeTextarea.value),
      excludedBrands: [],
      brandMode: brandSelect.value as BrandMode,
      sellerFilter: sellerSelect.value as SellerFilter,
      hideSponsored: sponsoredCb.checked,
      queryBuilder: qbCb.checked,
      minReviewQuality: parseInt(qualityInput.value, 10) || 0,
      useMLAnalysis: mlCb.checked,
      ignoredCategories: Array.from(categoryCheckboxes.entries())
        .filter(([_, cb]) => cb.checked)
        .map(([id, _]) => id),
      dedupCategories: Array.from(dedupCheckboxes.entries())
        .filter(([_, cb]) => cb.checked)
        .map(([id, _]) => id),
      totalPages: Math.min(10, Math.max(1, parseInt(pagesSelect.value, 10) || 1)),
      networkUsage: "auto",
      sortBy: "default",
    };
    callbacks.onFilterChange(state);
  }

  return host;
}

/**
 * Update the stats display in the filter bar.
 */
export function updateStats(
  host: HTMLElement,
  shown: number,
  total: number,
): void {
  const shadow = host.shadowRoot;
  if (!shadow) return;
  const el = shadow.getElementById("bas-stats");
  if (el) {
    el.textContent = `Showing ${shown} of ${total} results`;
  }
}

/**
 * Update the prefetch status text in the filter bar.
 */
export function updatePrefetchStatus(host: HTMLElement, text: string): void {
  const shadow = host.shadowRoot;
  if (!shadow) return;
  const el = shadow.getElementById("bas-prefetch-status");
  if (el) el.textContent = text;
}

// ── Helpers ──────────────────────────────────────────────────────────

function group(label: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "bas-filter-group";
  if (label) {
    const lbl = document.createElement("label");
    lbl.textContent = label;
    el.appendChild(lbl);
  }
  return el;
}

function sep(): HTMLElement {
  const el = document.createElement("div");
  el.className = "bas-separator";
  return el;
}

function input(
  type: string,
  attrs: Record<string, string>,
): HTMLInputElement {
  const el = document.createElement("input");
  el.type = type;
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

function parseExcludeTokens(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
