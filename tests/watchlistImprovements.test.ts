import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Chrome storage mock ──

type StorageCallback = (result: Record<string, unknown>) => void;
type SetCallback = (() => void) | undefined;

let storedData: Record<string, unknown> = {};

const notifCreateMock = vi.fn(
  (_id: string, _opts: unknown, cb?: () => void) => { cb?.(); },
);
const notifClearMock = vi.fn((_id: string, cb?: () => void) => { cb?.(); });

vi.stubGlobal("chrome", {
  storage: {
    sync: {
      get(keyOrKeys: string | string[], cb: StorageCallback) {
        const keys = typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys;
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (key in storedData) result[key] = storedData[key];
        }
        cb(result);
      },
      set(data: Record<string, unknown>, cb?: SetCallback) {
        Object.assign(storedData, data);
        cb?.();
      },
    },
    local: {
      get: vi.fn((_k: unknown, cb: StorageCallback) => cb({})),
      set: vi.fn((_d: unknown, cb?: SetCallback) => cb?.()),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: {
    lastError: undefined,
    sendMessage: vi.fn(() => Promise.resolve({ success: true })),
  },
  notifications: {
    create: notifCreateMock,
    clear: notifClearMock,
    onClicked: { addListener: vi.fn() },
  },
  tabs: { create: vi.fn() },
  alarms: { create: vi.fn(() => Promise.resolve()) },
});

import {
  loadWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlistPrice,
  updateTargetPrice,
  incrementFailures,
  loadNotificationPrefs,
  saveNotificationPrefs,
  MAX_PRICE_HISTORY,
} from "../src/watchlist/storage";
import type { NotificationPreferences } from "../src/watchlist/storage";
import {
  extractPriceFromHtml,
  isCaptchaPage,
  shouldNotify,
} from "../src/watchlist/checker";

// ── Custom Target Price ──

describe("custom target price", () => {
  beforeEach(() => { storedData = {}; });

  it("updates target price for existing item", async () => {
    await addToWatchlist("B0TEST1234", "Product", 29.99, 25.00);
    const updated = await updateTargetPrice("B0TEST1234", 20.00);
    expect(updated).not.toBeNull();
    expect(updated!.targetPrice).toBe(20.00);

    const items = await loadWatchlist();
    expect(items[0].targetPrice).toBe(20.00);
  });

  it("returns null for non-existent ASIN", async () => {
    const result = await updateTargetPrice("B0NONEXIST", 10.00);
    expect(result).toBeNull();
  });

  it("does not modify other fields when updating target", async () => {
    await addToWatchlist("B0TEST1234", "Product", 29.99, 25.00);
    await updateTargetPrice("B0TEST1234", 15.00);
    const items = await loadWatchlist();
    expect(items[0].priceWhenAdded).toBe(29.99);
    expect(items[0].lastKnownPrice).toBe(29.99);
    expect(items[0].title).toBe("Product");
  });
});

// ── Price History ──

describe("price history", () => {
  beforeEach(() => { storedData = {}; });

  it("initializes price history on add", async () => {
    await addToWatchlist("B0TEST1234", "Product", 29.99, 25.00);
    const items = await loadWatchlist();
    expect(items[0].priceHistory).toBeDefined();
    expect(items[0].priceHistory!.length).toBe(1);
    expect(items[0].priceHistory![0].price).toBe(29.99);
  });

  it("appends to price history on price update", async () => {
    await addToWatchlist("B0TEST1234", "Product", 29.99, 25.00);
    await updateWatchlistPrice("B0TEST1234", 27.50);
    await updateWatchlistPrice("B0TEST1234", 24.99);
    const items = await loadWatchlist();
    expect(items[0].priceHistory!.length).toBe(3);
    expect(items[0].priceHistory![0].price).toBe(29.99);
    expect(items[0].priceHistory![1].price).toBe(27.50);
    expect(items[0].priceHistory![2].price).toBe(24.99);
  });

  it("trims history to MAX_PRICE_HISTORY entries", async () => {
    await addToWatchlist("B0TEST1234", "Product", 100, 80);
    // Add MAX_PRICE_HISTORY more updates (total = MAX + 1, should trim to MAX)
    for (let i = 0; i < MAX_PRICE_HISTORY; i++) {
      await updateWatchlistPrice("B0TEST1234", 99 - i);
    }
    const items = await loadWatchlist();
    expect(items[0].priceHistory!.length).toBe(MAX_PRICE_HISTORY);
    // Oldest entry should have been trimmed (the initial $100)
    expect(items[0].priceHistory![0].price).toBe(99);
  });

  it("records timestamp with each price snapshot", async () => {
    await addToWatchlist("B0TEST1234", "Product", 29.99, 25.00);
    await updateWatchlistPrice("B0TEST1234", 25.00);
    const items = await loadWatchlist();
    for (const snap of items[0].priceHistory!) {
      expect(snap.checkedAt).toBeDefined();
      expect(new Date(snap.checkedAt).getTime()).toBeGreaterThan(0);
    }
  });

  it("handles legacy items without priceHistory", async () => {
    // Simulate a pre-existing watchlist item without priceHistory
    storedData["bas_watchlist"] = [{
      asin: "B0LEGACY",
      title: "Legacy Product",
      priceWhenAdded: 50,
      targetPrice: 40,
      lastKnownPrice: 50,
      addedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      domain: "www.amazon.com",
      // no priceHistory field
    }];
    await updateWatchlistPrice("B0LEGACY", 45);
    const items = await loadWatchlist();
    expect(items[0].priceHistory).toBeDefined();
    expect(items[0].priceHistory!.length).toBe(1);
    expect(items[0].priceHistory![0].price).toBe(45);
  });
});

// ── Consecutive Failures / Backoff ──

describe("consecutive failures and backoff", () => {
  beforeEach(() => { storedData = {}; });

  it("initializes consecutiveFailures to 0", async () => {
    await addToWatchlist("B0TEST1234", "Product", 29.99, 25.00);
    const items = await loadWatchlist();
    expect(items[0].consecutiveFailures).toBe(0);
  });

  it("increments consecutive failures", async () => {
    await addToWatchlist("B0TEST1234", "Product", 29.99, 25.00);
    const count1 = await incrementFailures("B0TEST1234");
    expect(count1).toBe(1);
    const count2 = await incrementFailures("B0TEST1234");
    expect(count2).toBe(2);

    const items = await loadWatchlist();
    expect(items[0].consecutiveFailures).toBe(2);
  });

  it("resets failures on successful price update", async () => {
    await addToWatchlist("B0TEST1234", "Product", 29.99, 25.00);
    await incrementFailures("B0TEST1234");
    await incrementFailures("B0TEST1234");

    // Successful update should reset
    await updateWatchlistPrice("B0TEST1234", 27.00);
    const items = await loadWatchlist();
    expect(items[0].consecutiveFailures).toBe(0);
  });

  it("returns 0 for non-existent ASIN", async () => {
    const count = await incrementFailures("B0NONEXIST");
    expect(count).toBe(0);
  });
});

// ── Captcha Detection ──

describe("isCaptchaPage", () => {
  it("detects standard captcha page", () => {
    expect(isCaptchaPage("Enter the characters you see below")).toBe(true);
  });

  it("detects robot check page", () => {
    expect(isCaptchaPage("Sorry, we just need to make sure you're not a robot")).toBe(true);
  });

  it("detects validateCaptcha form", () => {
    expect(isCaptchaPage('<form action="/errors/validateCaptcha">captcha image</form>')).toBe(true);
  });

  it("does not flag normal product pages", () => {
    expect(isCaptchaPage('<div class="a-offscreen">$29.99</div>')).toBe(false);
  });

  it("detects image-based captcha text", () => {
    expect(isCaptchaPage("Type the characters you see in this image")).toBe(true);
  });
});

// ── Notification Preferences ──

describe("notification preferences", () => {
  beforeEach(() => { storedData = {}; });

  it("loads defaults when nothing stored", async () => {
    const prefs = await loadNotificationPrefs();
    expect(prefs.enabled).toBe(true);
    expect(prefs.quietHoursStart).toBe(22);
    expect(prefs.quietHoursEnd).toBe(7);
    expect(prefs.checkIntervalMinutes).toBe(360);
  });

  it("saves and loads custom preferences", async () => {
    const custom: NotificationPreferences = {
      enabled: false,
      quietHoursStart: 20,
      quietHoursEnd: 8,
      checkIntervalMinutes: 180,
    };
    await saveNotificationPrefs(custom);
    const loaded = await loadNotificationPrefs();
    expect(loaded).toEqual(custom);
  });

  it("merges partial stored prefs with defaults", async () => {
    storedData["bas_notification_prefs"] = { enabled: false };
    const prefs = await loadNotificationPrefs();
    expect(prefs.enabled).toBe(false);
    expect(prefs.quietHoursStart).toBe(22); // default
    expect(prefs.checkIntervalMinutes).toBe(360); // default
  });
});

// ── shouldNotify ──

describe("shouldNotify", () => {
  it("returns false when notifications disabled", () => {
    expect(shouldNotify({
      enabled: false,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      checkIntervalMinutes: 360,
    })).toBe(false);
  });

  it("returns true when no quiet hours (start === end)", () => {
    expect(shouldNotify({
      enabled: true,
      quietHoursStart: 0,
      quietHoursEnd: 0,
      checkIntervalMinutes: 360,
    })).toBe(true);
  });

  it("handles overnight quiet hours correctly", () => {
    const prefs: NotificationPreferences = {
      enabled: true,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      checkIntervalMinutes: 360,
    };

    const hour = new Date().getHours();
    const result = shouldNotify(prefs);

    // During quiet hours (22-7), should be false; outside, true
    if (hour >= 22 || hour < 7) {
      expect(result).toBe(false);
    } else {
      expect(result).toBe(true);
    }
  });

  it("handles daytime quiet hours (start < end)", () => {
    const prefs: NotificationPreferences = {
      enabled: true,
      quietHoursStart: 9,
      quietHoursEnd: 17,
      checkIntervalMinutes: 360,
    };

    const hour = new Date().getHours();
    const result = shouldNotify(prefs);

    if (hour >= 9 && hour < 17) {
      expect(result).toBe(false);
    } else {
      expect(result).toBe(true);
    }
  });
});

// ── Price Extraction (existing tests extended) ──

describe("extractPriceFromHtml extended", () => {
  it("extracts price from a-offscreen", () => {
    expect(extractPriceFromHtml('<span class="a-offscreen">$29.99</span>')).toBe(29.99);
  });

  it("returns null for empty html", () => {
    expect(extractPriceFromHtml("")).toBeNull();
  });

  it("handles price without decimal", () => {
    expect(extractPriceFromHtml('<span class="a-offscreen">$100</span>')).toBe(100);
  });
});
