import { loadPreferences, savePreferences } from "../util/storage";
import { loadWatchlist, removeFromWatchlist } from "../watchlist/storage";
import type { WatchlistItem } from "../watchlist/storage";
import {
  loadShortlists,
  createShortlist,
  deleteShortlist,
  renameShortlist,
  removeFromShortlist,
  exportShortlistCsv,
  exportShortlistJson,
  getShortlistSummary,
} from "../shortlist/storage";
import type { Shortlist, ShortlistItem } from "../shortlist/storage";
import type { GlobalPreferences, BandwidthPreset, BrandMode, SellerFilter } from "../types";
import { DEFAULT_PREFERENCES, applyBandwidthPreset } from "../types";

/** DOM element references. */
interface PopupElements {
  presetBtns: NodeListOf<HTMLButtonElement>;
  sparklines: HTMLInputElement;
  reviewBadges: HTMLInputElement;
  dealBadges: HTMLInputElement;
  preload: HTMLInputElement;
  ml: HTMLInputElement;
  hideSponsored: HTMLInputElement;
  brandMode: HTMLSelectElement;
  sellerFilter: HTMLSelectElement;
  saveStatus: HTMLElement;
}

let currentPrefs: GlobalPreferences;
let statusTimeout: ReturnType<typeof setTimeout> | null = null;

function getElements(): PopupElements {
  return {
    presetBtns: document.querySelectorAll<HTMLButtonElement>(".preset-btn"),
    sparklines: document.getElementById("pref-sparklines") as HTMLInputElement,
    reviewBadges: document.getElementById("pref-review-badges") as HTMLInputElement,
    dealBadges: document.getElementById("pref-deal-badges") as HTMLInputElement,
    preload: document.getElementById("pref-preload") as HTMLInputElement,
    ml: document.getElementById("pref-ml") as HTMLInputElement,
    hideSponsored: document.getElementById("pref-hide-sponsored") as HTMLInputElement,
    brandMode: document.getElementById("pref-brand-mode") as HTMLSelectElement,
    sellerFilter: document.getElementById("pref-seller-filter") as HTMLSelectElement,
    saveStatus: document.getElementById("save-status") as HTMLElement,
  };
}

/** Populate all UI elements from current preferences. */
function renderPrefs(els: PopupElements, prefs: GlobalPreferences): void {
  // Preset buttons
  els.presetBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === prefs.bandwidthMode);
  });

  // Toggles
  els.sparklines.checked = prefs.showSparklines;
  els.reviewBadges.checked = prefs.showReviewBadges;
  els.dealBadges.checked = prefs.showDealBadges;
  els.preload.checked = prefs.preloadDetails;
  els.ml.checked = prefs.useMLAnalysis;
  els.hideSponsored.checked = prefs.hideSponsoredDefault;

  // Selects
  els.brandMode.value = prefs.defaultBrandMode;
  els.sellerFilter.value = prefs.defaultSellerFilter;
}

/** Gather current UI state into a GlobalPreferences object. */
function gatherPrefs(els: PopupElements): GlobalPreferences {
  return {
    bandwidthMode: currentPrefs.bandwidthMode,
    showSparklines: els.sparklines.checked,
    showReviewBadges: els.reviewBadges.checked,
    showDealBadges: els.dealBadges.checked,
    preloadDetails: els.preload.checked,
    useMLAnalysis: els.ml.checked,
    hideSponsoredDefault: els.hideSponsored.checked,
    defaultBrandMode: els.brandMode.value as BrandMode,
    defaultSellerFilter: els.sellerFilter.value as SellerFilter,
  };
}

/** Flash a "Saved ✓" status message. */
function flashSaved(els: PopupElements): void {
  els.saveStatus.textContent = "Saved ✓";
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    els.saveStatus.textContent = "";
  }, 1500);
}

/**
 * Determine the effective bandwidth preset based on individual toggle states.
 * If toggles don't match any preset exactly, keep current preset.
 */
function inferBandwidthPreset(prefs: GlobalPreferences): BandwidthPreset {
  if (
    prefs.showSparklines &&
    prefs.showReviewBadges &&
    prefs.showDealBadges &&
    prefs.preloadDetails &&
    prefs.useMLAnalysis
  ) {
    return "high";
  }
  if (
    !prefs.showSparklines &&
    !prefs.showReviewBadges &&
    !prefs.showDealBadges &&
    !prefs.preloadDetails &&
    !prefs.useMLAnalysis
  ) {
    return "low";
  }
  if (
    prefs.showSparklines &&
    prefs.showReviewBadges &&
    prefs.showDealBadges &&
    prefs.preloadDetails &&
    !prefs.useMLAnalysis
  ) {
    return "balanced";
  }
  return prefs.bandwidthMode;
}

async function init(): Promise<void> {
  const els = getElements();
  currentPrefs = await loadPreferences();
  renderPrefs(els, currentPrefs);

  // Preset button clicks
  els.presetBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const preset = btn.dataset.preset as BandwidthPreset;
      currentPrefs = applyBandwidthPreset(currentPrefs, preset);
      renderPrefs(els, currentPrefs);
      await savePreferences(currentPrefs);
      flashSaved(els);
    });
  });

  // Individual toggle changes — save immediately and update preset indicator
  const onToggleChange = async () => {
    currentPrefs = gatherPrefs(els);
    currentPrefs.bandwidthMode = inferBandwidthPreset(currentPrefs);
    renderPrefs(els, currentPrefs);
    await savePreferences(currentPrefs);
    flashSaved(els);
  };

  els.sparklines.addEventListener("change", onToggleChange);
  els.reviewBadges.addEventListener("change", onToggleChange);
  els.dealBadges.addEventListener("change", onToggleChange);
  els.preload.addEventListener("change", onToggleChange);
  els.ml.addEventListener("change", onToggleChange);
  els.hideSponsored.addEventListener("change", onToggleChange);
  els.brandMode.addEventListener("change", onToggleChange);
  els.sellerFilter.addEventListener("change", onToggleChange);

  // Render watchlist
  await renderWatchlist();

  // Render shortlists
  await renderShortlists();

  // New shortlist button
  document.getElementById("shortlist-new-btn")?.addEventListener("click", async () => {
    const name = prompt("Enter shortlist name:");
    if (name?.trim()) {
      try {
        await createShortlist(name.trim());
        await renderShortlists();
      } catch (e: any) {
        alert(e.message || "Failed to create shortlist");
      }
    }
  });
}

// ── Shortlists ────────────────────────────────────────────────────────

async function renderShortlists(): Promise<void> {
  const container = document.getElementById("shortlists-container")!;
  const emptyMsg = document.getElementById("shortlists-empty")!;
  const actionsRow = document.getElementById("shortlist-actions")!;
  const lists = await loadShortlists();

  container.innerHTML = "";

  if (lists.length === 0) {
    emptyMsg.style.display = "block";
    actionsRow.style.display = "none";
    return;
  }

  emptyMsg.style.display = "none";
  actionsRow.style.display = "block";

  for (const list of lists) {
    container.appendChild(createShortlistCard(list));
  }
}

function createShortlistCard(list: Shortlist): HTMLElement {
  const card = document.createElement("div");
  card.className = "shortlist-card";

  // Header (collapsible)
  const header = document.createElement("div");
  header.className = "shortlist-header";

  const name = document.createElement("span");
  name.className = "shortlist-name";
  name.textContent = list.name;

  const count = document.createElement("span");
  count.className = "shortlist-count";
  count.textContent = `${list.items.length} item${list.items.length !== 1 ? "s" : ""}`;

  const toggle = document.createElement("span");
  toggle.className = "shortlist-toggle";
  toggle.textContent = "▶";

  header.appendChild(name);
  header.appendChild(count);
  header.appendChild(toggle);

  // Body (hidden by default)
  const body = document.createElement("div");
  body.className = "shortlist-body";

  if (list.items.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "padding:10px;font-size:11px;color:#888c8c;text-align:center;";
    empty.textContent = "No items yet — use 📌 Save on search results";
    body.appendChild(empty);
  } else {
    for (const item of list.items) {
      body.appendChild(createShortlistItemEl(list.name, item));
    }
  }

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "shortlist-toolbar";

  const exportCsvBtn = toolbarBtn("CSV", "Export as CSV file");
  exportCsvBtn.addEventListener("click", () => downloadFile(
    `${list.name}.csv`,
    exportShortlistCsv(list),
    "text/csv",
  ));

  const exportJsonBtn = toolbarBtn("JSON", "Export as JSON file");
  exportJsonBtn.addEventListener("click", () => downloadFile(
    `${list.name}.json`,
    exportShortlistJson(list),
    "application/json",
  ));

  const copyBtn = toolbarBtn("📋 Copy", "Copy summary to clipboard");
  copyBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(getShortlistSummary(list));
    copyBtn.textContent = "✓ Copied";
    setTimeout(() => { copyBtn.textContent = "📋 Copy"; }, 1200);
  });

  const renameBtn = toolbarBtn("✏️ Rename", "Rename this shortlist");
  renameBtn.addEventListener("click", async () => {
    const newName = prompt("New name:", list.name);
    if (newName?.trim() && newName.trim() !== list.name) {
      try {
        await renameShortlist(list.name, newName.trim());
        await renderShortlists();
      } catch (e: any) {
        alert(e.message || "Failed to rename");
      }
    }
  });

  const deleteBtn = toolbarBtn("🗑️ Delete", "Delete this shortlist");
  deleteBtn.classList.add("danger");
  deleteBtn.addEventListener("click", async () => {
    if (confirm(`Delete "${list.name}" and all ${list.items.length} items?`)) {
      await deleteShortlist(list.name);
      await renderShortlists();
    }
  });

  toolbar.appendChild(exportCsvBtn);
  toolbar.appendChild(exportJsonBtn);
  toolbar.appendChild(copyBtn);
  toolbar.appendChild(renameBtn);
  toolbar.appendChild(deleteBtn);
  body.appendChild(toolbar);

  // Toggle expand/collapse
  header.addEventListener("click", () => {
    const isOpen = body.classList.toggle("open");
    toggle.classList.toggle("open", isOpen);
  });

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function createShortlistItemEl(listName: string, item: ShortlistItem): HTMLElement {
  const row = document.createElement("div");
  row.className = "shortlist-item";

  const info = document.createElement("div");
  info.className = "shortlist-item-info";

  const titleLink = document.createElement("a");
  titleLink.className = "shortlist-item-title";
  titleLink.textContent = item.title;
  titleLink.href = item.url;
  titleLink.target = "_blank";

  const meta = document.createElement("div");
  meta.className = "shortlist-item-meta";
  const price = item.price !== null ? `$${item.price.toFixed(2)}` : "N/A";
  const rq = item.reviewQuality !== undefined ? ` · RQ ${item.reviewQuality}` : "";
  meta.textContent = `${item.brand} · ${price} · ⭐ ${item.rating} (${item.reviewCount})${rq}`;

  info.appendChild(titleLink);
  info.appendChild(meta);

  const removeBtn = document.createElement("button");
  removeBtn.className = "shortlist-item-remove";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove from list";
  removeBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await removeFromShortlist(listName, item.asin);
    await renderShortlists();
  });

  row.appendChild(info);
  row.appendChild(removeBtn);
  return row;
}

function toolbarBtn(text: string, title: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "shortlist-toolbar-btn";
  btn.textContent = text;
  btn.title = title;
  return btn;
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function renderWatchlist(): Promise<void> {
  const container = document.getElementById("watchlist-items")!;
  const emptyMsg = document.getElementById("watchlist-empty")!;
  const items = await loadWatchlist();

  if (items.length === 0) {
    emptyMsg.style.display = "block";
    container.innerHTML = "";
    return;
  }

  emptyMsg.style.display = "none";
  container.innerHTML = "";

  for (const item of items) {
    container.appendChild(createWatchlistItemEl(item));
  }
}

function createWatchlistItemEl(item: WatchlistItem): HTMLElement {
  const row = document.createElement("div");
  row.className = "watchlist-item";

  const info = document.createElement("div");
  info.className = "watchlist-info";

  const title = document.createElement("div");
  title.className = "watchlist-title";
  title.textContent = item.title;

  const prices = document.createElement("div");
  prices.className = "watchlist-prices";
  const safeLastPrice = Number.isFinite(item.lastKnownPrice) ? item.lastKnownPrice : 0;
  const safeAddedPrice = Number.isFinite(item.priceWhenAdded) ? item.priceWhenAdded : 0;
  const safeTarget = Number.isFinite(item.targetPrice) ? item.targetPrice : 0;
  const diff = safeLastPrice - safeAddedPrice;
  const diffClass = diff < 0 ? "price-drop" : diff > 0 ? "price-up" : "";
  const diffText =
    diff < 0
      ? ` (↓ $${Math.abs(diff).toFixed(2)})`
      : diff > 0
        ? ` (↑ $${diff.toFixed(2)})`
        : "";

  const nowLabel = document.createTextNode("Now: ");
  const nowStrong = document.createElement("strong");
  nowStrong.textContent = `$${safeLastPrice.toFixed(2)}`;
  prices.appendChild(nowLabel);
  prices.appendChild(nowStrong);
  if (diffText) {
    const diffSpan = document.createElement("span");
    diffSpan.className = diffClass;
    diffSpan.textContent = diffText;
    prices.appendChild(diffSpan);
  }
  prices.appendChild(document.createTextNode(` · Target: $${safeTarget.toFixed(2)}`));

  info.appendChild(title);
  info.appendChild(prices);

  const removeBtn = document.createElement("button");
  removeBtn.className = "watchlist-remove";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove from watchlist";
  removeBtn.addEventListener("click", async () => {
    await removeFromWatchlist(item.asin);
    await renderWatchlist();
  });

  row.appendChild(info);
  row.appendChild(removeBtn);
  return row;
}

document.addEventListener("DOMContentLoaded", init);
