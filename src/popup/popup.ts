import { loadPreferences, savePreferences } from "../util/storage";
import type { GlobalPreferences, BandwidthPreset, BrandMode, SellerFilter } from "../types";
import { DEFAULT_PREFERENCES, applyBandwidthPreset } from "../types";

/** DOM element references. */
interface PopupElements {
  presetBtns: NodeListOf<HTMLButtonElement>;
  sparklines: HTMLInputElement;
  reviewBadges: HTMLInputElement;
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
    prefs.preloadDetails &&
    prefs.useMLAnalysis
  ) {
    return "high";
  }
  if (
    !prefs.showSparklines &&
    !prefs.showReviewBadges &&
    !prefs.preloadDetails &&
    !prefs.useMLAnalysis
  ) {
    return "low";
  }
  if (
    prefs.showSparklines &&
    prefs.showReviewBadges &&
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
  els.preload.addEventListener("change", onToggleChange);
  els.ml.addEventListener("change", onToggleChange);
  els.hideSponsored.addEventListener("change", onToggleChange);
  els.brandMode.addEventListener("change", onToggleChange);
  els.sellerFilter.addEventListener("change", onToggleChange);
}

document.addEventListener("DOMContentLoaded", init);
