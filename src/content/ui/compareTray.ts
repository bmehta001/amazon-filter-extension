/**
 * Floating comparison tray — shows pinned products at the bottom of the page.
 * Expands into a scrollable side-by-side comparison table.
 */

import type { CompareItem } from "../../compare/storage";
import { removeFromCompare, clearCompare } from "../../compare/storage";

// ── Styles ────────────────────────────────────────────────────────────

export const COMPARE_TRAY_STYLES = `
.bas-compare-tray {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 99990;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 13px;
  color: #0f1111;
  transition: transform 0.25s ease;
}
.bas-compare-tray--hidden {
  transform: translateY(100%);
}

/* Collapsed bar */
.bas-compare-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #232f3e, #37475a);
  color: #fff;
  cursor: pointer;
  user-select: none;
}
.bas-compare-bar__label {
  font-weight: 600;
  font-size: 13px;
}
.bas-compare-bar__count {
  background: #ff9900;
  color: #111;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
}
.bas-compare-bar__chips {
  display: flex;
  gap: 6px;
  flex: 1;
  overflow-x: auto;
  padding: 2px 0;
}
.bas-compare-chip {
  background: rgba(255,255,255,0.15);
  color: #fff;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  white-space: nowrap;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
}
.bas-compare-chip__remove {
  cursor: pointer;
  opacity: 0.6;
  font-size: 13px;
}
.bas-compare-chip__remove:hover { opacity: 1; }
.bas-compare-bar__actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.bas-compare-btn {
  padding: 4px 12px;
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 4px;
  background: transparent;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.bas-compare-btn:hover { background: rgba(255,255,255,0.1); }
.bas-compare-btn--primary {
  background: #ff9900;
  color: #111;
  border-color: #ff9900;
  font-weight: 600;
}
.bas-compare-btn--primary:hover { background: #e88b00; }

/* Expanded table panel */
.bas-compare-panel {
  display: none;
  background: #fff;
  border-top: 2px solid #ff9900;
  max-height: 60vh;
  overflow: auto;
  padding: 12px 16px;
}
.bas-compare-panel--open { display: block; }
.bas-compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.bas-compare-table th {
  position: sticky;
  left: 0;
  background: #f7f7f7;
  font-weight: 600;
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid #e8e8e8;
  white-space: nowrap;
  min-width: 120px;
}
.bas-compare-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: top;
  min-width: 160px;
  max-width: 220px;
}
.bas-compare-table tr:hover td { background: #fafafa; }
.bas-compare-table .bas-best { color: #067d06; font-weight: 600; }
.bas-compare-table .bas-worst { color: #b12704; }
.bas-compare-remove-col {
  cursor: pointer;
  color: #b12704;
  font-size: 11px;
  text-align: center;
}
.bas-compare-remove-col:hover { text-decoration: underline; }
.bas-compare-title-cell {
  font-weight: 500;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bas-compare-title-cell a {
  color: #0066c0;
  text-decoration: none;
}
.bas-compare-title-cell a:hover { text-decoration: underline; }
`;

// ── Tray construction ─────────────────────────────────────────────────

let trayElement: HTMLElement | null = null;
let trayExpanded = false;

/**
 * Create or update the comparison tray. If no items, hides the tray.
 */
export function renderCompareTray(items: CompareItem[]): void {
  if (items.length === 0) {
    if (trayElement) {
      trayElement.classList.add("bas-compare-tray--hidden");
    }
    return;
  }

  if (!trayElement) {
    trayElement = document.createElement("div");
    trayElement.className = "bas-compare-tray";
    // Inject styles into document (not shadow DOM — tray is fixed)
    if (!document.getElementById("bas-compare-styles")) {
      const style = document.createElement("style");
      style.id = "bas-compare-styles";
      style.textContent = COMPARE_TRAY_STYLES;
      document.head.appendChild(style);
    }
    document.body.appendChild(trayElement);
  }

  trayElement.classList.remove("bas-compare-tray--hidden");
  trayElement.innerHTML = "";

  // ── Collapsed bar ──
  const bar = document.createElement("div");
  bar.className = "bas-compare-bar";

  const label = document.createElement("span");
  label.className = "bas-compare-bar__label";
  label.textContent = "⚖️ Compare";
  bar.appendChild(label);

  const count = document.createElement("span");
  count.className = "bas-compare-bar__count";
  count.textContent = String(items.length);
  bar.appendChild(count);

  // Product chips
  const chips = document.createElement("div");
  chips.className = "bas-compare-bar__chips";
  for (const item of items) {
    const chip = document.createElement("span");
    chip.className = "bas-compare-chip";
    chip.title = item.title;

    const chipText = document.createElement("span");
    chipText.textContent = truncate(item.title, 25);
    chip.appendChild(chipText);

    const removeX = document.createElement("span");
    removeX.className = "bas-compare-chip__remove";
    removeX.textContent = "✕";
    removeX.addEventListener("click", (e) => {
      e.stopPropagation();
      void removeFromCompare(item.asin);
    });
    chip.appendChild(removeX);
    chips.appendChild(chip);
  }
  bar.appendChild(chips);

  // Actions
  const actions = document.createElement("div");
  actions.className = "bas-compare-bar__actions";

  if (items.length >= 2) {
    const expandBtn = document.createElement("button");
    expandBtn.className = "bas-compare-btn bas-compare-btn--primary";
    expandBtn.textContent = trayExpanded ? "▼ Collapse" : "▲ Compare";
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      trayExpanded = !trayExpanded;
      expandBtn.textContent = trayExpanded ? "▼ Collapse" : "▲ Compare";
      panel.classList.toggle("bas-compare-panel--open", trayExpanded);
    });
    actions.appendChild(expandBtn);
  }

  const clearBtn = document.createElement("button");
  clearBtn.className = "bas-compare-btn";
  clearBtn.textContent = "Clear";
  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    trayExpanded = false;
    void clearCompare();
  });
  actions.appendChild(clearBtn);
  bar.appendChild(actions);
  trayElement.appendChild(bar);

  // ── Expanded comparison panel ──
  const panel = document.createElement("div");
  panel.className = `bas-compare-panel${trayExpanded ? " bas-compare-panel--open" : ""}`;

  if (items.length >= 2) {
    panel.appendChild(buildCompareTable(items));
  }
  trayElement.appendChild(panel);
}

// ── Comparison table ──────────────────────────────────────────────────

interface RowDef {
  label: string;
  getValue: (item: CompareItem) => string | number | null;
  bestFn?: "max" | "min";
  format?: (v: string | number | null) => string;
}

const TABLE_ROWS: RowDef[] = [
  { label: "Title", getValue: (i) => i.title },
  { label: "Brand", getValue: (i) => i.brand },
  { label: "Price", getValue: (i) => i.price, bestFn: "min", format: fmtPrice },
  { label: "Rating", getValue: (i) => i.rating, bestFn: "max", format: fmtRating },
  { label: "Reviews", getValue: (i) => i.reviewCount, bestFn: "max", format: fmtNum },
  { label: "Review Quality", getValue: (i) => i.reviewQuality ?? null, bestFn: "max", format: fmtScore },
  { label: "Trust Score", getValue: (i) => i.trustScore ?? null, bestFn: "max", format: fmtScore },
  { label: "Seller Trust", getValue: (i) => i.sellerTrust ?? null, bestFn: "max", format: fmtScore },
  { label: "Deal Score", getValue: (i) => i.dealScore ?? null, bestFn: "max", format: fmtScore },
  { label: "Seller", getValue: (i) => i.seller ?? "" },
  { label: "Search Query", getValue: (i) => i.searchQuery },
];

function buildCompareTable(items: CompareItem[]): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "bas-compare-table";

  for (const rowDef of TABLE_ROWS) {
    const tr = document.createElement("tr");

    const th = document.createElement("th");
    th.textContent = rowDef.label;
    tr.appendChild(th);

    // Compute best/worst for highlighting
    const values = items.map((item) => rowDef.getValue(item));
    const numericValues = values.filter((v) => typeof v === "number") as number[];
    let bestVal: number | null = null;
    let worstVal: number | null = null;
    if (rowDef.bestFn && numericValues.length >= 2) {
      bestVal = rowDef.bestFn === "max" ? Math.max(...numericValues) : Math.min(...numericValues);
      worstVal = rowDef.bestFn === "max" ? Math.min(...numericValues) : Math.max(...numericValues);
      if (bestVal === worstVal) { bestVal = null; worstVal = null; }
    }

    for (let ci = 0; ci < items.length; ci++) {
      const td = document.createElement("td");
      const raw = values[ci];
      const formatted = rowDef.format ? rowDef.format(raw) : String(raw ?? "—");

      if (rowDef.label === "Title") {
        td.className = "bas-compare-title-cell";
        const a = document.createElement("a");
        a.href = items[ci].url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = truncate(String(raw ?? ""), 60);
        a.title = String(raw ?? "");
        td.appendChild(a);
      } else {
        td.textContent = formatted;
      }

      // Highlight best/worst
      if (typeof raw === "number" && bestVal !== null) {
        if (raw === bestVal) td.classList.add("bas-best");
        else if (raw === worstVal) td.classList.add("bas-worst");
      }

      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  // Remove row
  const removeRow = document.createElement("tr");
  const removeHead = document.createElement("th");
  removeHead.textContent = "";
  removeRow.appendChild(removeHead);
  for (const item of items) {
    const td = document.createElement("td");
    td.className = "bas-compare-remove-col";
    td.textContent = "✕ Remove";
    td.addEventListener("click", () => {
      void removeFromCompare(item.asin);
    });
    removeRow.appendChild(td);
  }
  table.appendChild(removeRow);

  return table;
}

// ── Formatters ────────────────────────────────────────────────────────

function fmtPrice(v: string | number | null): string {
  if (v === null || v === "") return "—";
  return `$${Number(v).toFixed(2)}`;
}

function fmtRating(v: string | number | null): string {
  if (v === null || v === "") return "—";
  return `${Number(v).toFixed(1)} ★`;
}

function fmtNum(v: string | number | null): string {
  if (v === null || v === "") return "—";
  return Number(v).toLocaleString();
}

function fmtScore(v: string | number | null): string {
  if (v === null || v === "") return "—";
  return `${Math.round(Number(v))}/100`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

/** Remove the tray from DOM (for cleanup). */
export function destroyCompareTray(): void {
  trayElement?.remove();
  trayElement = null;
  trayExpanded = false;
}
