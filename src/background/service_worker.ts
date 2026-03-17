import { refreshAllowlistFromRemote } from "../brand/allowlist";
import { checkWatchlistPrices, WATCHLIST_ALARM_NAME, WATCHLIST_CHECK_INTERVAL_MINUTES } from "../watchlist/checker";

const ALARM_NAME = "refreshBrandAllowlist";
const REFRESH_INTERVAL_MINUTES = 1440; // 24 hours

/**
 * Service worker entry point.
 * Handles:
 * - Brand allowlist daily refresh via chrome.alarms
 * - Extension install/update initialization
 */

// ── Install / Update ─────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[BAS] Extension installed/updated:", details.reason);

  // Set up daily allowlist refresh alarm
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1, // First refresh 1 min after install
    periodInMinutes: REFRESH_INTERVAL_MINUTES,
  });

  // Set up watchlist price check alarm
  await chrome.alarms.create(WATCHLIST_ALARM_NAME, {
    delayInMinutes: 5,
    periodInMinutes: WATCHLIST_CHECK_INTERVAL_MINUTES,
  });

  // Perform initial allowlist refresh
  if (details.reason === "install" || details.reason === "update") {
    const success = await refreshAllowlistFromRemote();
    console.log("[BAS] Initial allowlist refresh:", success ? "success" : "failed (will use bundled)");
  }
});

// ── Alarm Handler ────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("[BAS] Refreshing brand allowlist...");
    const success = await refreshAllowlistFromRemote();
    console.log("[BAS] Allowlist refresh:", success ? "success" : "failed");
  }
  if (alarm.name === WATCHLIST_ALARM_NAME) {
    console.log("[BAS] Checking watchlist prices...");
    await checkWatchlistPrices();
  }
});

// ── Message Handler (for content script communication) ───────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "refreshAllowlist") {
    refreshAllowlistFromRemote().then((success) => {
      sendResponse({ success });
    });
    return true; // Keep message channel open for async response
  }
});
