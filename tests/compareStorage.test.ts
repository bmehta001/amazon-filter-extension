import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadCompareItems,
  addToCompare,
  removeFromCompare,
  clearCompare,
  isInCompare,
  onCompareChange,
  resetCompareCache,
} from "../src/compare/storage";
import type { CompareItem } from "../src/compare/storage";

function makeItem(overrides: Partial<CompareItem> = {}): CompareItem {
  return {
    asin: "B000TEST01",
    title: "Test Headphones",
    brand: "TestBrand",
    price: 29.99,
    rating: 4.5,
    reviewCount: 100,
    url: "https://www.amazon.com/dp/B000TEST01",
    pinnedAt: Date.now(),
    searchQuery: "headphones",
    ...overrides,
  };
}

beforeEach(() => {
  resetCompareCache();
  // Reset chrome.storage.session mock
  const store: Record<string, unknown> = {};
  (globalThis as any).chrome = {
    storage: {
      session: {
        get: vi.fn((key: string, cb: (result: Record<string, unknown>) => void) => {
          cb({ [key]: store[key] ?? [] });
        }),
        set: vi.fn((data: Record<string, unknown>, cb: () => void) => {
          for (const [k, v] of Object.entries(data)) store[k] = v;
          cb();
        }),
      },
    },
    runtime: { lastError: null },
  };
});

describe("loadCompareItems", () => {
  it("returns empty array on first load", async () => {
    const items = await loadCompareItems();
    expect(items).toEqual([]);
  });

  it("caches results after first load", async () => {
    await loadCompareItems();
    await loadCompareItems();
    expect(chrome.storage.session.get).toHaveBeenCalledTimes(1);
  });
});

describe("addToCompare", () => {
  it("adds an item", async () => {
    const added = await addToCompare(makeItem());
    expect(added).toBe(true);
    const items = await loadCompareItems();
    expect(items).toHaveLength(1);
    expect(items[0].asin).toBe("B000TEST01");
  });

  it("rejects duplicate ASINs", async () => {
    await addToCompare(makeItem());
    const added = await addToCompare(makeItem({ title: "Different title" }));
    expect(added).toBe(false);
    const items = await loadCompareItems();
    expect(items).toHaveLength(1);
  });

  it("allows different ASINs", async () => {
    await addToCompare(makeItem({ asin: "B001" }));
    await addToCompare(makeItem({ asin: "B002" }));
    const items = await loadCompareItems();
    expect(items).toHaveLength(2);
  });

  it("rejects when at max capacity (20)", async () => {
    for (let i = 0; i < 20; i++) {
      await addToCompare(makeItem({ asin: `B${String(i).padStart(3, "0")}` }));
    }
    const added = await addToCompare(makeItem({ asin: "BOVERFLOW" }));
    expect(added).toBe(false);
    const items = await loadCompareItems();
    expect(items).toHaveLength(20);
  });

  it("preserves enrichment data", async () => {
    await addToCompare(makeItem({
      reviewQuality: 85,
      trustScore: 70,
      sellerTrust: 60,
      dealScore: 78,
      seller: "Amazon.com",
    }));
    const items = await loadCompareItems();
    expect(items[0].reviewQuality).toBe(85);
    expect(items[0].trustScore).toBe(70);
    expect(items[0].sellerTrust).toBe(60);
    expect(items[0].dealScore).toBe(78);
    expect(items[0].seller).toBe("Amazon.com");
  });
});

describe("removeFromCompare", () => {
  it("removes by ASIN", async () => {
    await addToCompare(makeItem({ asin: "B001" }));
    await addToCompare(makeItem({ asin: "B002" }));
    await removeFromCompare("B001");
    const items = await loadCompareItems();
    expect(items).toHaveLength(1);
    expect(items[0].asin).toBe("B002");
  });

  it("handles removing non-existent ASIN gracefully", async () => {
    await addToCompare(makeItem());
    await removeFromCompare("NONEXISTENT");
    const items = await loadCompareItems();
    expect(items).toHaveLength(1);
  });
});

describe("clearCompare", () => {
  it("removes all items", async () => {
    await addToCompare(makeItem({ asin: "B001" }));
    await addToCompare(makeItem({ asin: "B002" }));
    await clearCompare();
    const items = await loadCompareItems();
    expect(items).toHaveLength(0);
  });
});

describe("isInCompare", () => {
  it("returns true for pinned items", async () => {
    await addToCompare(makeItem());
    expect(await isInCompare("B000TEST01")).toBe(true);
  });

  it("returns false for non-pinned items", async () => {
    expect(await isInCompare("B000TEST01")).toBe(false);
  });
});

describe("onCompareChange", () => {
  it("notifies listeners on add", async () => {
    const listener = vi.fn();
    onCompareChange(listener);
    await addToCompare(makeItem());
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ asin: "B000TEST01" }),
    ]));
  });

  it("notifies listeners on remove", async () => {
    const listener = vi.fn();
    await addToCompare(makeItem());
    onCompareChange(listener);
    await removeFromCompare("B000TEST01");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([]);
  });

  it("notifies listeners on clear", async () => {
    const listener = vi.fn();
    await addToCompare(makeItem({ asin: "B001" }));
    await addToCompare(makeItem({ asin: "B002" }));
    onCompareChange(listener);
    await clearCompare();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([]);
  });
});

describe("resetCompareCache", () => {
  it("forces reload from storage on next access", async () => {
    await loadCompareItems();
    resetCompareCache();
    await loadCompareItems();
    expect(chrome.storage.session.get).toHaveBeenCalledTimes(2);
  });
});

// ── Edge case tests ─────────────────────────────────────────────────

describe("compare storage edge cases", () => {
  it("works when chrome is undefined", async () => {
    (globalThis as any).chrome = undefined;
    resetCompareCache();
    const items = await loadCompareItems();
    expect(items).toEqual([]);
  });

  it("works when chrome.storage.session is undefined", async () => {
    (globalThis as any).chrome = { storage: {}, runtime: { lastError: null } };
    resetCompareCache();
    const items = await loadCompareItems();
    expect(items).toEqual([]);
  });

  it("handles chrome.runtime.lastError on load", async () => {
    (globalThis as any).chrome.storage.session.get = vi.fn((_key: string, cb: (result: Record<string, unknown>) => void) => {
      (globalThis as any).chrome.runtime.lastError = { message: "Quota exceeded" };
      cb({});
      (globalThis as any).chrome.runtime.lastError = null;
    });
    resetCompareCache();
    const items = await loadCompareItems();
    expect(items).toEqual([]);
  });

  it("listener errors do not break other listeners", async () => {
    const badListener = vi.fn(() => { throw new Error("listener crash"); });
    const goodListener = vi.fn();
    onCompareChange(badListener);
    onCompareChange(goodListener);
    await addToCompare(makeItem());
    expect(badListener).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it("item with null price stores correctly", async () => {
    await addToCompare(makeItem({ price: null }));
    const items = await loadCompareItems();
    expect(items[0].price).toBeNull();
  });

  it("item with empty string fields stores correctly", async () => {
    await addToCompare(makeItem({ brand: "", title: "", searchQuery: "" }));
    const items = await loadCompareItems();
    expect(items[0].brand).toBe("");
    expect(items[0].title).toBe("");
    expect(items[0].searchQuery).toBe("");
  });

  it("removing from empty list does not throw", async () => {
    await removeFromCompare("NONEXIST");
    const items = await loadCompareItems();
    expect(items).toEqual([]);
  });

  it("clearing an already-empty list does not throw", async () => {
    await clearCompare();
    const items = await loadCompareItems();
    expect(items).toEqual([]);
  });

  it("isInCompare returns false after clear", async () => {
    await addToCompare(makeItem());
    await clearCompare();
    expect(await isInCompare("B000TEST01")).toBe(false);
  });
});
