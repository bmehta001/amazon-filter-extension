import { loadPreferences, savePreferences } from "../util/storage";
import { loadWatchlist, removeFromWatchlist, updateTargetPrice, loadNotificationPrefs, saveNotificationPrefs } from "../watchlist/storage";
import type { WatchlistItem, NotificationPreferences, PriceSnapshot } from "../watchlist/storage";
import { getCurrentMonthInsights } from "../insights/dashboard";
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

  // Tab switching
  const tabs = document.querySelectorAll<HTMLButtonElement>(".popup-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = `tab-${tab.dataset.tab}`;
      // Deactivate all tabs and panels
      tabs.forEach((t) => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
      document.querySelectorAll(".popup-tab-content").forEach((p) => p.classList.remove("active"));
      // Activate clicked tab and panel
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      document.getElementById(targetId)?.classList.add("active");
    });
  });

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

  // Render shopping insights
  await renderInsights();

  // Render watchlist
  await renderWatchlist();

  // Render notification preferences
  await renderNotificationPrefs();

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

// ── Shopping Insights ──────────────────────────────────────────────────

async function renderInsights(): Promise<void> {
  try {
    const insights = await getCurrentMonthInsights();
    const analyzed = document.getElementById("insight-analyzed");
    const suspicious = document.getElementById("insight-suspicious");
    const savings = document.getElementById("insight-savings");
    const drops = document.getElementById("insight-drops");

    if (analyzed) analyzed.textContent = insights.productsAnalyzed.toLocaleString();
    if (suspicious) suspicious.textContent = insights.suspiciousListingsFlagged.toLocaleString();
    if (savings) savings.textContent = `$${insights.estimatedSavings.toFixed(0)}`;
    if (drops) drops.textContent = insights.priceDropsCaught.toLocaleString();
  } catch {
    // Insights may not exist yet
  }
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

  // Title as link to product page
  const titleLink = document.createElement("a");
  titleLink.className = "watchlist-title";
  titleLink.textContent = item.title;
  titleLink.href = `https://${item.domain}/dp/${item.asin}`;
  titleLink.target = "_blank";

  // Price comparison bar
  const priceBar = document.createElement("div");
  priceBar.className = "watchlist-price-bar";

  const safeLastPrice = Number.isFinite(item.lastKnownPrice) ? item.lastKnownPrice : 0;
  const safeAddedPrice = Number.isFinite(item.priceWhenAdded) ? item.priceWhenAdded : 0;
  const safeTarget = Number.isFinite(item.targetPrice) ? item.targetPrice : 0;
  const diff = safeLastPrice - safeAddedPrice;

  // Current price with change indicator
  const currentEl = document.createElement("span");
  currentEl.className = "watchlist-current-price";
  currentEl.textContent = `$${safeLastPrice.toFixed(2)}`;
  if (diff < 0) {
    currentEl.classList.add("price-drop");
    currentEl.textContent += ` ↓${Math.abs(diff).toFixed(2)}`;
  } else if (diff > 0) {
    currentEl.classList.add("price-up");
    currentEl.textContent += ` ↑${diff.toFixed(2)}`;
  }

  const origEl = document.createElement("span");
  origEl.className = "watchlist-orig-price";
  origEl.textContent = `Was $${safeAddedPrice.toFixed(2)}`;

  // Editable target price
  const targetEl = document.createElement("span");
  targetEl.className = "watchlist-target-price";
  targetEl.title = "Click to edit target price";

  const targetLabel = document.createElement("span");
  targetLabel.textContent = `Target: $${safeTarget.toFixed(2)}`;

  const editBtn = document.createElement("button");
  editBtn.className = "watchlist-edit-target";
  editBtn.textContent = "✎";
  editBtn.title = "Edit target price";
  editBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const input = prompt("Enter target price ($):", safeTarget.toFixed(2));
    if (input !== null) {
      const newTarget = parseFloat(input);
      if (Number.isFinite(newTarget) && newTarget > 0) {
        await updateTargetPrice(item.asin, newTarget);
        await renderWatchlist();
      }
    }
  });

  targetEl.appendChild(targetLabel);
  targetEl.appendChild(editBtn);

  // Progress toward target
  const progressContainer = document.createElement("div");
  progressContainer.className = "watchlist-progress";
  if (safeAddedPrice > safeTarget && safeTarget > 0) {
    const totalDrop = safeAddedPrice - safeTarget;
    const currentDrop = Math.max(0, safeAddedPrice - safeLastPrice);
    const pct = Math.min(100, Math.round((currentDrop / totalDrop) * 100));
    const bar = document.createElement("div");
    bar.className = "watchlist-progress-bar";
    const fill = document.createElement("div");
    fill.className = "watchlist-progress-fill";
    fill.style.width = `${pct}%`;
    fill.style.background = pct >= 100 ? "#067d62" : "#007185";
    bar.appendChild(fill);
    const pctLabel = document.createElement("span");
    pctLabel.className = "watchlist-progress-label";
    pctLabel.textContent = pct >= 100 ? "Target reached!" : `${pct}% to target`;
    progressContainer.appendChild(bar);
    progressContainer.appendChild(pctLabel);
  }

  priceBar.appendChild(currentEl);
  priceBar.appendChild(origEl);
  priceBar.appendChild(targetEl);

  // Mini price history sparkline
  const history = item.priceHistory || [];
  let sparklineEl: HTMLElement | null = null;
  if (history.length >= 2) {
    sparklineEl = createMiniSparkline(history, safeTarget);
  }

  // Last checked timestamp
  const lastChecked = document.createElement("div");
  lastChecked.className = "watchlist-last-checked";
  const checkedDate = new Date(item.lastCheckedAt);
  const ago = formatTimeAgo(checkedDate);
  lastChecked.textContent = `Checked ${ago}`;
  if ((item.consecutiveFailures || 0) > 0) {
    lastChecked.textContent += ` · ${item.consecutiveFailures} failure${item.consecutiveFailures === 1 ? "" : "s"}`;
    lastChecked.style.color = "#cc0c39";
  }

  info.appendChild(titleLink);
  info.appendChild(priceBar);
  info.appendChild(progressContainer);
  if (sparklineEl) info.appendChild(sparklineEl);
  info.appendChild(lastChecked);

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

/** Draw an SVG sparkline from price history. */
function createMiniSparkline(history: PriceSnapshot[], targetPrice: number): HTMLElement {
  const container = document.createElement("div");
  container.className = "watchlist-sparkline";

  const prices = history.map((s) => s.price);
  const minP = Math.min(...prices, targetPrice);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const W = 200;
  const H = 30;
  const padding = 2;

  const points = prices.map((p, i) => {
    const x = padding + (i / Math.max(prices.length - 1, 1)) * (W - 2 * padding);
    const y = padding + (1 - (p - minP) / range) * (H - 2 * padding);
    return `${x},${y}`;
  });

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Target price line
  const targetY = padding + (1 - (targetPrice - minP) / range) * (H - 2 * padding);
  svg += `<line x1="${padding}" y1="${targetY}" x2="${W - padding}" y2="${targetY}" stroke="#067d62" stroke-width="0.5" stroke-dasharray="3,2" />`;

  // Price line
  svg += `<polyline fill="none" stroke="#007185" stroke-width="1.5" points="${points.join(" ")}" />`;

  // Last point dot
  const lastPoint = points[points.length - 1];
  svg += `<circle cx="${lastPoint.split(",")[0]}" cy="${lastPoint.split(",")[1]}" r="2" fill="#007185" />`;

  svg += `</svg>`;
  container.innerHTML = svg;

  // Labels
  const labels = document.createElement("div");
  labels.className = "watchlist-sparkline-labels";
  const firstDate = new Date(history[0].checkedAt);
  const lastDate = new Date(history[history.length - 1].checkedAt);
  labels.textContent = `${formatShortDate(firstDate)} → ${formatShortDate(lastDate)}`;
  container.appendChild(labels);

  return container;
}

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ── Notification Preferences ──────────────────────────────────────────

async function renderNotificationPrefs(): Promise<void> {
  const section = document.getElementById("notification-prefs");
  if (!section) return;

  const prefs = await loadNotificationPrefs();

  const enabledCb = section.querySelector<HTMLInputElement>("#notif-enabled");
  const quietStart = section.querySelector<HTMLSelectElement>("#notif-quiet-start");
  const quietEnd = section.querySelector<HTMLSelectElement>("#notif-quiet-end");
  const freqSelect = section.querySelector<HTMLSelectElement>("#notif-frequency");

  if (enabledCb) enabledCb.checked = prefs.enabled;
  if (quietStart) quietStart.value = String(prefs.quietHoursStart);
  if (quietEnd) quietEnd.value = String(prefs.quietHoursEnd);
  if (freqSelect) freqSelect.value = String(prefs.checkIntervalMinutes);

  const onChange = async () => {
    const updated: NotificationPreferences = {
      enabled: enabledCb?.checked ?? true,
      quietHoursStart: parseInt(quietStart?.value ?? "22", 10),
      quietHoursEnd: parseInt(quietEnd?.value ?? "7", 10),
      checkIntervalMinutes: parseInt(freqSelect?.value ?? "360", 10),
    };
    await saveNotificationPrefs(updated);

    // Update the alarm interval in the service worker
    try {
      await chrome.runtime.sendMessage({
        type: "updateWatchlistAlarm",
        intervalMinutes: updated.checkIntervalMinutes,
      });
    } catch { /* service worker may not be running */ }

    const saveStatus = document.getElementById("save-status");
    if (saveStatus) {
      saveStatus.textContent = "Saved ✓";
      setTimeout(() => { saveStatus.textContent = ""; }, 1500);
    }
  };

  enabledCb?.addEventListener("change", onChange);
  quietStart?.addEventListener("change", onChange);
  quietEnd?.addEventListener("change", onChange);
  freqSelect?.addEventListener("change", onChange);
}

document.addEventListener("DOMContentLoaded", init);
