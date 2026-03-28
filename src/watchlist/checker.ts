/**
 * Background price checker — runs in the service worker to periodically
 * check prices for watchlisted items and send notifications on price drops.
 */

import { loadWatchlist, updateWatchlistPrice, incrementFailures, loadNotificationPrefs } from "./storage";
import type { WatchlistItem, NotificationPreferences } from "./storage";

export const WATCHLIST_ALARM_NAME = "checkWatchlistPrices";
export const WATCHLIST_CHECK_INTERVAL_MINUTES = 360; // 6 hours

/** Max consecutive failures before skipping an item until it recovers. */
const MAX_CONSECUTIVE_FAILURES = 5;

/** Base delay between item fetches (ms). */
const BASE_FETCH_DELAY = 1000;

/**
 * Check prices for all items in the watchlist.
 * Fetches each product page and extracts the current price.
 * Sends a Chrome notification when a price drops below the target.
 */
export async function checkWatchlistPrices(): Promise<void> {
  const items = await loadWatchlist();
  if (items.length === 0) return;

  const prefs = await loadNotificationPrefs();

  console.log(`[BAS] Checking prices for ${items.length} watchlist items...`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Skip items that have failed too many times in a row
    if ((item.consecutiveFailures || 0) >= MAX_CONSECUTIVE_FAILURES) {
      console.log(`[BAS] Skipping ${item.asin} — ${item.consecutiveFailures} consecutive failures`);
      continue;
    }

    // Exponential backoff delay between fetches
    const failures = item.consecutiveFailures || 0;
    const delay = failures > 0
      ? Math.min(BASE_FETCH_DELAY * Math.pow(2, failures), 30000)
      : (i > 0 ? BASE_FETCH_DELAY : 0);

    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      await checkSingleItem(item, prefs);
    } catch (err) {
      console.error(`[BAS] Price check failed for ${item.asin}:`, err);
      await incrementFailures(item.asin);
    }
  }

  console.log("[BAS] Watchlist price check complete.");
}

async function checkSingleItem(item: WatchlistItem, prefs: NotificationPreferences): Promise<void> {
  const url = `https://${item.domain}/dp/${item.asin}`;

  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "text/html",
    },
  });

  // Handle rate limiting and server errors with backoff
  if (response.status === 429 || response.status === 503) {
    console.warn(`[BAS] Rate limited for ${item.asin}: ${response.status}`);
    await incrementFailures(item.asin);
    return;
  }

  if (!response.ok) {
    console.warn(`[BAS] Failed to fetch ${item.asin}: ${response.status}`);
    await incrementFailures(item.asin);
    return;
  }

  const html = await response.text();

  // Detect captcha / bot check pages
  if (isCaptchaPage(html)) {
    console.warn(`[BAS] Captcha detected for ${item.asin} — backing off`);
    await incrementFailures(item.asin);
    return;
  }

  const currentPrice = extractPriceFromHtml(html);

  if (currentPrice === null) {
    console.warn(`[BAS] Could not extract price for ${item.asin}`);
    return;
  }

  const updated = await updateWatchlistPrice(item.asin, currentPrice);
  if (!updated) return;

  // Check if price dropped below target
  if (currentPrice <= item.targetPrice && currentPrice < item.lastKnownPrice) {
    if (shouldNotify(prefs)) {
      await sendPriceDropNotification(item, currentPrice);
    }
  }
}

/** Detect captcha / bot verification pages. */
export function isCaptchaPage(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("enter the characters you see below") ||
    lower.includes("type the characters you see in this image") ||
    lower.includes("sorry, we just need to make sure you") ||
    (lower.includes("captcha") && lower.includes("validatecaptcha"))
  );
}

/** Check if notifications should fire right now based on preferences. */
export function shouldNotify(prefs: NotificationPreferences): boolean {
  if (!prefs.enabled) return false;

  const hour = new Date().getHours();
  const { quietHoursStart, quietHoursEnd } = prefs;

  if (quietHoursStart === quietHoursEnd) return true; // no quiet hours

  // Handle overnight quiet hours (e.g., 22-7)
  if (quietHoursStart > quietHoursEnd) {
    if (hour >= quietHoursStart || hour < quietHoursEnd) return false;
  } else {
    if (hour >= quietHoursStart && hour < quietHoursEnd) return false;
  }

  return true;
}

/**
 * Extract price from raw product page HTML.
 * Uses regex patterns since we can't use DOM parsing in the service worker.
 */
export function extractPriceFromHtml(html: string): number | null {
  // Pattern 1: a-offscreen price (most reliable)
  const offscreenMatch = html.match(
    /class="a-offscreen">\s*\$?([\d,]+\.?\d*)/,
  );
  if (offscreenMatch) {
    return parseFloat(offscreenMatch[1].replace(/,/g, ""));
  }

  // Pattern 2: priceAmount in JSON
  const jsonMatch = html.match(/"priceAmount":\s*([\d.]+)/);
  if (jsonMatch) {
    return parseFloat(jsonMatch[1]);
  }

  // Pattern 3: price-whole + price-fraction
  const wholeMatch = html.match(/a-price-whole[^>]*>(\d+)/);
  const fractionMatch = html.match(/a-price-fraction[^>]*>(\d+)/);
  if (wholeMatch) {
    const whole = parseInt(wholeMatch[1], 10);
    const fraction = fractionMatch ? parseInt(fractionMatch[1], 10) : 0;
    return whole + fraction / 100;
  }

  return null;
}

async function sendPriceDropNotification(
  item: WatchlistItem,
  newPrice: number,
): Promise<void> {
  const savings = (item.priceWhenAdded - newPrice).toFixed(2);
  const dropPercent = Math.round(
    ((item.priceWhenAdded - newPrice) / item.priceWhenAdded) * 100,
  );

  try {
    await chrome.notifications.create(`bas-price-drop-${item.asin}`, {
      type: "basic",
      iconUrl: "public/icons/icon128.png",
      title: `🔔 Price Drop Alert!`,
      message: `${item.title.slice(0, 60)}...\n$${newPrice.toFixed(2)} (was $${item.priceWhenAdded.toFixed(2)}) — Save $${savings} (${dropPercent}% off)`,
      priority: 2,
    });
  } catch (err) {
    console.error("[BAS] Notification error:", err);
  }
}
