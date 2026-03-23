/**
 * Advanced Search panel — visual builder for Amazon's hidden URL parameters.
 * Provides server-side filtering via department, condition, star rating,
 * Prime-only, price range, sort, and keyword exclusion.
 */

import {
  DEPARTMENTS,
  CONDITIONS,
  STAR_RATINGS,
  SORT_OPTIONS,
  DEFAULT_ADVANCED_OPTIONS,
  buildAdvancedSearchUrl,
  parseAdvancedOptions,
} from "../../util/amazonParams";
import type { AdvancedSearchOptions } from "../../util/amazonParams";

export const ADVANCED_SEARCH_STYLES = `
.bas-adv-toggle {
  cursor: pointer;
  color: #0066c0;
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid #d5d9d9;
  border-radius: 4px;
  background: #fff;
  white-space: nowrap;
}
.bas-adv-toggle:hover {
  background: #f7f7f7;
  color: #c45500;
}

.bas-adv-panel {
  display: none;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 99997;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0,0,0,.25);
  padding: 20px 24px;
  max-width: 480px;
  width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 13px;
  color: #0f1111;
}
.bas-adv-panel--open { display: block; }

.bas-adv-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 99996;
  background: rgba(0,0,0,.3);
}
.bas-adv-overlay--open { display: block; }

.bas-adv-panel h3 {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 700;
  color: #0f1111;
}

.bas-adv-section {
  margin-bottom: 12px;
}
.bas-adv-label {
  display: block;
  font-weight: 600;
  font-size: 12px;
  color: #565959;
  margin-bottom: 4px;
}
.bas-adv-select,
.bas-adv-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #d5d9d9;
  border-radius: 4px;
  font-size: 13px;
  background: #fff;
  color: #0f1111;
  box-sizing: border-box;
}
.bas-adv-select:focus,
.bas-adv-input:focus {
  outline: none;
  border-color: #e77600;
  box-shadow: 0 0 0 2px rgba(228,121,17,.15);
}

.bas-adv-row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.bas-adv-row > * { flex: 1; }

.bas-adv-cb-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}
.bas-adv-cb-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #e77600;
}
.bas-adv-cb-row label {
  font-size: 13px;
  cursor: pointer;
}

.bas-adv-textarea {
  width: 100%;
  min-height: 50px;
  padding: 6px 8px;
  border: 1px solid #d5d9d9;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}
.bas-adv-textarea::placeholder {
  color: #999;
}

.bas-adv-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  justify-content: flex-end;
}
.bas-adv-btn {
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid #d5d9d9;
  background: #fff;
  color: #0f1111;
}
.bas-adv-btn:hover { background: #f7f7f7; }
.bas-adv-btn--primary {
  background: #ffd814;
  border-color: #fcd200;
  color: #0f1111;
}
.bas-adv-btn--primary:hover { background: #f7ca00; }

.bas-adv-preview {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f7f7f7;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  font-size: 11px;
  color: #565959;
  word-break: break-all;
  max-height: 60px;
  overflow-y: auto;
}
.bas-adv-preview strong {
  color: #0f1111;
}

.bas-adv-hint {
  font-size: 10px;
  color: #999;
  margin-top: 2px;
}
`;

// ── Panel creation ────────────────────────────────────────────────────

let panelElement: HTMLElement | null = null;
let overlayElement: HTMLElement | null = null;

/**
 * Create the Advanced Search toggle button.
 * Returns the button element to be added to the filter bar.
 */
export function createAdvancedSearchToggle(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "bas-adv-toggle";
  btn.textContent = "🔧 Advanced Search";
  btn.title = "Open advanced search builder with server-side filters";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAdvancedSearch();
  });
  return btn;
}

function openAdvancedSearch(): void {
  if (panelElement) {
    panelElement.classList.add("bas-adv-panel--open");
    overlayElement?.classList.add("bas-adv-overlay--open");
    return;
  }

  // Inject styles
  if (!document.getElementById("bas-adv-styles")) {
    const style = document.createElement("style");
    style.id = "bas-adv-styles";
    style.textContent = ADVANCED_SEARCH_STYLES;
    document.head.appendChild(style);
  }

  // Parse current URL for existing advanced options
  const existing = parseAdvancedOptions();
  const currentQuery = new URLSearchParams(location.search).get("k") ?? "";
  // Strip existing exclusions from the base query for display
  const baseQuery = currentQuery.replace(/-"[^"]+"/g, "").replace(/-\S+/g, "").trim();

  // Create overlay
  overlayElement = document.createElement("div");
  overlayElement.className = "bas-adv-overlay bas-adv-overlay--open";
  overlayElement.addEventListener("click", closeAdvancedSearch);
  document.body.appendChild(overlayElement);

  // Create panel
  panelElement = document.createElement("div");
  panelElement.className = "bas-adv-panel bas-adv-panel--open";
  panelElement.addEventListener("click", (e) => e.stopPropagation());

  const title = document.createElement("h3");
  title.textContent = "🔧 Advanced Search Builder";
  panelElement.appendChild(title);

  // ── Department ──
  const deptSelect = createSelect("Department", DEPARTMENTS.map((d): [string, string] => [d.nodeId, d.label]), existing.department ?? "");
  panelElement.appendChild(deptSelect.section);

  // ── Condition ──
  const condSelect = createSelect("Condition", [["", "Any"] as [string, string], ...CONDITIONS.map((c): [string, string] => [c.value, c.label])], existing.condition ?? "");
  panelElement.appendChild(condSelect.section);

  // ── Star Rating ──
  const starSelect = createSelect("Minimum Rating", [["", "Any"] as [string, string], ...STAR_RATINGS.map((s): [string, string] => [s.value, s.label])], existing.minStars ?? "");
  panelElement.appendChild(starSelect.section);

  // ── Sort ──
  const sortSelect = createSelect("Sort By", SORT_OPTIONS.map((s): [string, string] => [s.value, s.label]), existing.sort ?? "");
  panelElement.appendChild(sortSelect.section);

  // ── Price Range (server-side) ──
  const priceSection = document.createElement("div");
  priceSection.className = "bas-adv-section";
  const priceLabel = document.createElement("label");
  priceLabel.className = "bas-adv-label";
  priceLabel.textContent = "Price Range (server-side)";
  priceSection.appendChild(priceLabel);

  const priceRow = document.createElement("div");
  priceRow.className = "bas-adv-row";
  const priceMinInput = document.createElement("input");
  priceMinInput.className = "bas-adv-input";
  priceMinInput.type = "number";
  priceMinInput.placeholder = "Min $";
  priceMinInput.min = "0";
  priceMinInput.step = "1";
  if (existing.priceMin != null) priceMinInput.value = String(existing.priceMin);
  const priceTo = document.createElement("span");
  priceTo.textContent = "to";
  priceTo.style.cssText = "flex: 0; white-space: nowrap; color: #888;";
  const priceMaxInput = document.createElement("input");
  priceMaxInput.className = "bas-adv-input";
  priceMaxInput.type = "number";
  priceMaxInput.placeholder = "Max $";
  priceMaxInput.min = "0";
  priceMaxInput.step = "1";
  if (existing.priceMax != null) priceMaxInput.value = String(existing.priceMax);
  priceRow.append(priceMinInput, priceTo, priceMaxInput);
  priceSection.appendChild(priceRow);
  const priceHint = document.createElement("div");
  priceHint.className = "bas-adv-hint";
  priceHint.textContent = "Applied server-side — reduces results before page loads";
  priceSection.appendChild(priceHint);
  const priceWarning = document.createElement("div");
  priceWarning.className = "bas-adv-hint";
  priceWarning.style.color = "#b07c0a";
  priceWarning.textContent =
    "⚠ Uses listed price, not coupon-adjusted price. Items in range after coupons may be excluded.";
  priceSection.appendChild(priceWarning);
  panelElement.appendChild(priceSection);

  // ── Checkboxes ──
  const primeCb = createCheckbox("Prime eligible only", existing.primeOnly ?? false);
  panelElement.appendChild(primeCb.row);
  const amazonCb = createCheckbox("Sold by Amazon only", existing.amazonOnly ?? false);
  panelElement.appendChild(amazonCb.row);

  // ── Exclude Words ──
  const excludeSection = document.createElement("div");
  excludeSection.className = "bas-adv-section";
  const excludeLabel = document.createElement("label");
  excludeLabel.className = "bas-adv-label";
  excludeLabel.textContent = "Exclude Words (server-side)";
  excludeSection.appendChild(excludeLabel);
  const excludeTextarea = document.createElement("textarea");
  excludeTextarea.className = "bas-adv-textarea";
  excludeTextarea.placeholder = "cheap, knockoff, refurbished\n(comma-separated)";
  if (existing.excludeWords?.length) {
    excludeTextarea.value = existing.excludeWords.join(", ");
  }
  excludeSection.appendChild(excludeTextarea);
  const excludeHint = document.createElement("div");
  excludeHint.className = "bas-adv-hint";
  excludeHint.textContent = "These words are excluded from Amazon's search query, not just hidden client-side";
  excludeSection.appendChild(excludeHint);
  panelElement.appendChild(excludeSection);

  // ── URL Preview ──
  const previewSection = document.createElement("div");
  previewSection.className = "bas-adv-preview";
  previewSection.innerHTML = "<strong>URL Preview:</strong> ";
  const previewUrl = document.createElement("span");
  previewSection.appendChild(previewUrl);
  panelElement.appendChild(previewSection);

  // ── Actions ──
  const actions = document.createElement("div");
  actions.className = "bas-adv-actions";

  const resetBtn = document.createElement("button");
  resetBtn.className = "bas-adv-btn";
  resetBtn.textContent = "Reset";
  resetBtn.addEventListener("click", () => {
    deptSelect.select.value = "";
    condSelect.select.value = "";
    starSelect.select.value = "";
    sortSelect.select.value = "";
    priceMinInput.value = "";
    priceMaxInput.value = "";
    primeCb.cb.checked = false;
    amazonCb.cb.checked = false;
    excludeTextarea.value = "";
    updatePreview();
  });
  actions.appendChild(resetBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "bas-adv-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeAdvancedSearch);
  actions.appendChild(cancelBtn);

  const applyBtn = document.createElement("button");
  applyBtn.className = "bas-adv-btn bas-adv-btn--primary";
  applyBtn.textContent = "🔍 Apply & Search";
  applyBtn.addEventListener("click", () => {
    const url = buildUrl();
    closeAdvancedSearch();
    window.location.href = url;
  });
  actions.appendChild(applyBtn);
  panelElement.appendChild(actions);

  document.body.appendChild(panelElement);

  // Live preview update
  function buildOptions(): AdvancedSearchOptions {
    const excludeWords = excludeTextarea.value
      .split(/[,\n]/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    return {
      excludeWords,
      department: deptSelect.select.value,
      minStars: starSelect.select.value,
      condition: condSelect.select.value,
      primeOnly: primeCb.cb.checked,
      priceMin: priceMinInput.value ? parseFloat(priceMinInput.value) : null,
      priceMax: priceMaxInput.value ? parseFloat(priceMaxInput.value) : null,
      sort: sortSelect.select.value,
      amazonOnly: amazonCb.cb.checked,
    };
  }

  function buildUrl(): string {
    return buildAdvancedSearchUrl(baseQuery, buildOptions());
  }

  function updatePreview(): void {
    const url = buildUrl();
    try {
      const parsed = new URL(url);
      previewUrl.textContent = parsed.pathname + parsed.search;
    } catch {
      previewUrl.textContent = url;
    }
  }

  // Attach live preview listeners
  for (const el of [deptSelect.select, condSelect.select, starSelect.select, sortSelect.select, priceMinInput, priceMaxInput, excludeTextarea]) {
    el.addEventListener("input", updatePreview);
    el.addEventListener("change", updatePreview);
  }
  primeCb.cb.addEventListener("change", updatePreview);
  amazonCb.cb.addEventListener("change", updatePreview);

  // Initial preview
  updatePreview();
}

function closeAdvancedSearch(): void {
  panelElement?.classList.remove("bas-adv-panel--open");
  overlayElement?.classList.remove("bas-adv-overlay--open");
}

/** Remove panel from DOM entirely (for cleanup). */
export function destroyAdvancedSearch(): void {
  panelElement?.remove();
  overlayElement?.remove();
  panelElement = null;
  overlayElement = null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function createSelect(
  label: string,
  options: [string, string][],
  defaultValue: string,
): { section: HTMLElement; select: HTMLSelectElement } {
  const section = document.createElement("div");
  section.className = "bas-adv-section";
  const lbl = document.createElement("label");
  lbl.className = "bas-adv-label";
  lbl.textContent = label;
  section.appendChild(lbl);
  const select = document.createElement("select");
  select.className = "bas-adv-select";
  for (const [value, text] of options) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    if (value === defaultValue) opt.selected = true;
    select.appendChild(opt);
  }
  section.appendChild(select);
  return { section, select };
}

function createCheckbox(
  label: string,
  checked: boolean,
): { row: HTMLElement; cb: HTMLInputElement } {
  const row = document.createElement("div");
  row.className = "bas-adv-cb-row";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = checked;
  cb.id = `bas-adv-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const lbl = document.createElement("label");
  lbl.htmlFor = cb.id;
  lbl.textContent = label;
  row.append(cb, lbl);
  return { row, cb };
}
