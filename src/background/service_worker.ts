import { refreshAllowlistFromRemote } from "../brand/allowlist";
import { checkWatchlistPrices, WATCHLIST_ALARM_NAME, WATCHLIST_CHECK_INTERVAL_MINUTES } from "../watchlist/checker";
import { loadNotificationPrefs } from "../watchlist/storage";
import { markWelcomeSeen } from "../onboarding/state";
import { initUsageOnInstall } from "../insights/usageTracker";

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

  // Show extension icon only on Amazon pages
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    const amazonDomains = [
      "www.amazon.com", "www.amazon.co.uk", "www.amazon.ca",
      "www.amazon.de", "www.amazon.fr", "www.amazon.it",
      "www.amazon.es", "www.amazon.in", "www.amazon.co.jp",
      "www.amazon.com.au",
    ];
    const rules = amazonDomains.map((host) => ({
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostEquals: host, schemes: ["https"] },
        }),
      ],
      actions: [new chrome.declarativeContent.ShowAction()],
    }));
    chrome.declarativeContent.onPageChanged.addRules(rules);
  });

  // Perform initial allowlist refresh
  if (details.reason === "install" || details.reason === "update") {
    const success = await refreshAllowlistFromRemote();
    console.log("[BAS] Initial allowlist refresh:", success ? "success" : "failed (will use bundled)");
  }

  // Open onboarding welcome page on first install
  if (details.reason === "install") {
    await markWelcomeSeen();
    await initUsageOnInstall();
    chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding/onboarding.html") });
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

  if (message.type === "fetchRecalls") {
    const query = message.query as string;
    const url = `https://www.saferproducts.gov/RestWebServices/Recall?ProductName=${encodeURIComponent(query)}&format=json`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`CPSC API ${res.status}`);
        return res.json();
      })
      .then((recalls) => sendResponse({ recalls }))
      .catch((err) => sendResponse({ error: err.message, recalls: [] }));
    return true;
  }

  if (message.type === "updateWatchlistAlarm") {
    const minutes = message.intervalMinutes as number;
    chrome.alarms.create(WATCHLIST_ALARM_NAME, {
      delayInMinutes: minutes,
      periodInMinutes: minutes,
    }).then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
});

// ── Notification Click Handler ───────────────────────────────────────

chrome.notifications.onClicked.addListener((notificationId) => {
  // Price drop notifications have the format: bas-price-drop-{ASIN}
  const match = notificationId.match(/^bas-price-drop-([A-Z0-9]{10})$/i);
  if (match) {
    const asin = match[1];
    const url = `https://www.amazon.com/dp/${asin}`;
    chrome.tabs.create({ url });
    chrome.notifications.clear(notificationId);
  }
});
