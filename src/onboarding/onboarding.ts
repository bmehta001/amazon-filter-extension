import { loadPreferences, savePreferences } from "../util/storage";
import { applyBandwidthPreset } from "../types";
import type { BandwidthPreset, GlobalPreferences } from "../types";
import { markWelcomeSeen } from "./state";

let currentPrefs: GlobalPreferences;

async function init(): Promise<void> {
  currentPrefs = await loadPreferences();

  const presetBtns = document.querySelectorAll<HTMLButtonElement>(".preset-btn");

  // Highlight the current preset
  presetBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === currentPrefs.bandwidthMode);
  });

  // Preset button clicks
  presetBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const preset = btn.dataset.preset as BandwidthPreset;
      currentPrefs = applyBandwidthPreset(currentPrefs, preset);
      presetBtns.forEach((b) => {
        b.classList.toggle("active", b.dataset.preset === preset);
      });
      await savePreferences(currentPrefs);
    });
  });

  // Start Shopping CTA
  document.getElementById("start-btn")?.addEventListener("click", async () => {
    await markWelcomeSeen();
    window.location.href = "https://www.amazon.com";
  });
}

document.addEventListener("DOMContentLoaded", init);
