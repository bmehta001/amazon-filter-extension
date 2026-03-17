/**
 * Background price checker — runs in the service worker to periodically
 * check prices for watchlisted items and send notifications on price drops.
 */

import { loadWatchlist, updateWatchlistPrice } from "./storage";
import type { WatchlistItem } from "./storage";

export const WATCHLIST_ALARM_NAME = "checkWatchlistPrices";
export const WATCHLIST_CHECK_INTERVAL_MINUTES = 360; // 6 hours

/**
 * Check prices for all items in the watchlist.
 * Fetches each product page and extracts the current price.
 * Sends a Chrome notification when a price drops below the target.
 */
export async function checkWatchlistPrices(): Promise<void> {
  const items = await loadWatchlist();
  if (items.length === 0) return;

  console.log(`[BAS] Checking prices for ${items.length} watchlist items...`);

  // Stagger fetches to avoid rate limiting (1 second between each)
  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    try {
      await checkSingleItem(items[i]);
    } catch (err) {
      console.error(`[BAS] Price check failed for ${items[i].asin}:`, err);
    }
  }

  console.log("[BAS] Watchlist price check complete.");
}

async function checkSingleItem(item: WatchlistItem): Promise<void> {
  const url = `https://${item.domain}/dp/${item.asin}`;

  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    console.warn(`[BAS] Failed to fetch ${item.asin}: ${response.status}`);
    return;
  }

  const html = await response.text();
  const currentPrice = extractPriceFromHtml(html);

  if (currentPrice === null) {
    console.warn(`[BAS] Could not extract price for ${item.asin}`);
    return;
  }

  const updated = await updateWatchlistPrice(item.asin, currentPrice);
  if (!updated) return;

  // Check if price dropped below target
  if (currentPrice <= item.targetPrice && currentPrice < item.lastKnownPrice) {
    await sendPriceDropNotification(item, currentPrice);
  }
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
