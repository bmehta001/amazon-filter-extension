import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Chrome storage mock with real storage behavior ──

type StorageCallback = (result: Record<string, unknown>) => void;
type SetCallback = (() => void) | undefined;

let storedData: Record<string, unknown> = {};

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
  runtime: { lastError: undefined },
  notifications: { create: vi.fn() },
});

import {
  loadWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlistPrice,
  isWatched,
  getWatchlistItem,
} from "../src/watchlist/storage";
import { extractPriceFromHtml } from "../src/watchlist/checker";

// ── Watchlist Storage ──

describe("watchlist storage", () => {
  beforeEach(() => {
    storedData = {};
  });

  it("loads empty watchlist initially", async () => {
    const items = await loadWatchlist();
    expect(items).toEqual([]);
  });

  it("adds an item to watchlist", async () => {
    await addToWatchlist("B0TEST1234", "Test Product", 29.99, 25.00);
    const items = await loadWatchlist();
    expect(items.length).toBe(1);
    expect(items[0].asin).toBe("B0TEST1234");
    expect(items[0].priceWhenAdded).toBe(29.99);
    expect(items[0].targetPrice).toBe(25.00);
    expect(items[0].domain).toBe("www.amazon.com");
  });

  it("does not add duplicate ASINs", async () => {
    await addToWatchlist("B0TEST1234", "Product 1", 29.99, 25.00);
    await addToWatchlist("B0TEST1234", "Product 1 again", 19.99, 15.00);
    const items = await loadWatchlist();
    expect(items.length).toBe(1);
  });

  it("removes an item from watchlist", async () => {
    await addToWatchlist("B0TEST1234", "Product 1", 29.99, 25.00);
    await addToWatchlist("B0TEST5678", "Product 2", 49.99, 40.00);
    await removeFromWatchlist("B0TEST1234");
    const items = await loadWatchlist();
    expect(items.length).toBe(1);
    expect(items[0].asin).toBe("B0TEST5678");
  });

  it("updates price for watched item", async () => {
    await addToWatchlist("B0TEST1234", "Product 1", 29.99, 25.00);
    const updated = await updateWatchlistPrice("B0TEST1234", 24.99);
    expect(updated).not.toBeNull();
    expect(updated!.lastKnownPrice).toBe(24.99);

    const items = await loadWatchlist();
    expect(items[0].lastKnownPrice).toBe(24.99);
  });

  it("returns null when updating non-existent item", async () => {
    const updated = await updateWatchlistPrice("B0NONEXIST", 19.99);
    expect(updated).toBeNull();
  });

  it("checks if ASIN is watched", async () => {
    await addToWatchlist("B0TEST1234", "Product 1", 29.99, 25.00);
    expect(await isWatched("B0TEST1234")).toBe(true);
    expect(await isWatched("B0OTHER")).toBe(false);
  });

  it("gets a single watchlist item by ASIN", async () => {
    await addToWatchlist("B0TEST1234", "Product 1", 29.99, 25.00);
    const item = await getWatchlistItem("B0TEST1234");
    expect(item).not.toBeNull();
    expect(item!.title).toBe("Product 1");

    const missing = await getWatchlistItem("B0OTHER");
    expect(missing).toBeNull();
  });

  it("truncates long titles", async () => {
    const longTitle = "A".repeat(200);
    await addToWatchlist("B0TEST1234", longTitle, 29.99, 25.00);
    const items = await loadWatchlist();
    expect(items[0].title.length).toBe(120);
  });
});

// ── Price extraction from HTML ──

describe("extractPriceFromHtml", () => {
  it("extracts price from a-offscreen", () => {
    const html = `<span class="a-offscreen">$29.99</span>`;
    expect(extractPriceFromHtml(html)).toBe(29.99);
  });

  it("extracts price from priceAmount JSON", () => {
    const html = `{"priceAmount": 49.99}`;
    expect(extractPriceFromHtml(html)).toBe(49.99);
  });

  it("extracts price from whole + fraction", () => {
    const html = `
      <span class="a-price-whole">29</span>
      <span class="a-price-fraction">99</span>
    `;
    expect(extractPriceFromHtml(html)).toBe(29.99);
  });

  it("handles comma-separated thousands", () => {
    const html = `<span class="a-offscreen">$1,299.99</span>`;
    expect(extractPriceFromHtml(html)).toBe(1299.99);
  });

  it("returns null when no price found", () => {
    const html = `<div>No price here</div>`;
    expect(extractPriceFromHtml(html)).toBeNull();
  });
});
