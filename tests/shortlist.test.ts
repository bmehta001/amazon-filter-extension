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
  loadShortlists,
  createShortlist,
  deleteShortlist,
  renameShortlist,
  addToShortlist,
  removeFromShortlist,
  isInAnyShortlist,
  exportShortlistCsv,
  exportShortlistJson,
  getShortlistSummary,
} from "../src/shortlist/storage";

import type { ShortlistItem, Shortlist } from "../src/shortlist/storage";

// ── Helpers ──

function makeItem(overrides: Partial<ShortlistItem> = {}): ShortlistItem {
  return {
    asin: "B0TEST0001",
    title: "Test Product",
    brand: "TestBrand",
    price: 29.99,
    rating: 4.5,
    reviewCount: 120,
    url: "https://www.amazon.com/dp/B0TEST0001",
    addedAt: Date.now(),
    ...overrides,
  };
}

// ── Shortlist Storage ──

describe("shortlist storage", () => {
  beforeEach(() => {
    storedData = {};
  });

  it("loads empty shortlists initially", async () => {
    const lists = await loadShortlists();
    expect(lists).toEqual([]);
  });

  it("creates a list and verifies it appears", async () => {
    const created = await createShortlist("Gifts");
    expect(created.name).toBe("Gifts");
    expect(created.items).toEqual([]);

    const lists = await loadShortlists();
    expect(lists.length).toBe(1);
    expect(lists[0].name).toBe("Gifts");
  });

  it("does not create duplicate names", async () => {
    await createShortlist("Gifts");
    await expect(createShortlist("Gifts")).rejects.toThrow("already exists");
  });

  it("enforces max 20 lists limit", async () => {
    for (let i = 0; i < 20; i++) {
      await createShortlist(`List ${i}`);
    }
    await expect(createShortlist("One Too Many")).rejects.toThrow("Maximum of 20");
  });

  it("adds an item to a list and verifies", async () => {
    await createShortlist("Tech");
    const item = makeItem();
    await addToShortlist("Tech", item);

    const lists = await loadShortlists();
    expect(lists[0].items.length).toBe(1);
    expect(lists[0].items[0].asin).toBe("B0TEST0001");
  });

  it("does not add duplicate ASINs", async () => {
    await createShortlist("Tech");
    const item = makeItem();
    await addToShortlist("Tech", item);
    await addToShortlist("Tech", { ...item, title: "Same ASIN different title" });

    const lists = await loadShortlists();
    expect(lists[0].items.length).toBe(1);
  });

  it("enforces max 50 items per list", async () => {
    await createShortlist("Full");
    for (let i = 0; i < 50; i++) {
      await addToShortlist("Full", makeItem({ asin: `B0ITEM${String(i).padStart(4, "0")}` }));
    }
    await expect(
      addToShortlist("Full", makeItem({ asin: "B0OVERFLOW1" })),
    ).rejects.toThrow("Maximum of 50");
  });

  it("removes an item from a list", async () => {
    await createShortlist("Tech");
    await addToShortlist("Tech", makeItem({ asin: "B0AAA00001" }));
    await addToShortlist("Tech", makeItem({ asin: "B0AAA00002" }));
    await removeFromShortlist("Tech", "B0AAA00001");

    const lists = await loadShortlists();
    expect(lists[0].items.length).toBe(1);
    expect(lists[0].items[0].asin).toBe("B0AAA00002");
  });

  it("renames a list", async () => {
    await createShortlist("Old Name");
    await renameShortlist("Old Name", "New Name");

    const lists = await loadShortlists();
    expect(lists.length).toBe(1);
    expect(lists[0].name).toBe("New Name");
  });

  it("does not rename to an existing name", async () => {
    await createShortlist("List A");
    await createShortlist("List B");
    await expect(renameShortlist("List A", "List B")).rejects.toThrow("already exists");
  });

  it("deletes a list", async () => {
    await createShortlist("Temp");
    await createShortlist("Keep");
    await deleteShortlist("Temp");

    const lists = await loadShortlists();
    expect(lists.length).toBe(1);
    expect(lists[0].name).toBe("Keep");
  });

  it("isInAnyShortlist returns correct list names", async () => {
    await createShortlist("Gifts");
    await createShortlist("Tech");
    await createShortlist("Empty");
    await addToShortlist("Gifts", makeItem({ asin: "B0SHARED01" }));
    await addToShortlist("Tech", makeItem({ asin: "B0SHARED01" }));

    const names = await isInAnyShortlist("B0SHARED01");
    expect(names).toEqual(["Gifts", "Tech"]);

    const none = await isInAnyShortlist("B0NOTFOUND");
    expect(none).toEqual([]);
  });

  it("truncates title to 120 chars on add", async () => {
    await createShortlist("Long");
    const longTitle = "A".repeat(200);
    await addToShortlist("Long", makeItem({ title: longTitle }));

    const lists = await loadShortlists();
    expect(lists[0].items[0].title.length).toBe(120);
  });
});

// ── Export: CSV ──

describe("exportShortlistCsv", () => {
  it("generates correct CSV with headers", () => {
    const now = Date.now();
    const list: Shortlist = {
      name: "Test",
      createdAt: now,
      updatedAt: now,
      items: [
        makeItem({ addedAt: now, dealScore: 85, reviewQuality: 72 }),
      ],
    };

    const csv = exportShortlistCsv(list);
    const lines = csv.split("\n");

    expect(lines[0]).toBe(
      "ASIN,Title,Brand,Price,Rating,Reviews,URL,Added,Deal Score,Review Quality",
    );
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain("B0TEST0001");
    expect(lines[1]).toContain("85");
    expect(lines[1]).toContain("72");
  });

  it("escapes commas in titles", () => {
    const now = Date.now();
    const list: Shortlist = {
      name: "Test",
      createdAt: now,
      updatedAt: now,
      items: [makeItem({ title: "Widget, Deluxe Edition", addedAt: now })],
    };

    const csv = exportShortlistCsv(list);
    expect(csv).toContain('"Widget, Deluxe Edition"');
  });

  it("handles null price as empty field", () => {
    const now = Date.now();
    const list: Shortlist = {
      name: "Test",
      createdAt: now,
      updatedAt: now,
      items: [makeItem({ price: null, addedAt: now })],
    };

    const csv = exportShortlistCsv(list);
    const dataRow = csv.split("\n")[1];
    const fields = dataRow.split(",");
    // Price is the 4th field (index 3)
    expect(fields[3]).toBe("");
  });
});

// ── Export: JSON ──

describe("exportShortlistJson", () => {
  it("generates valid pretty-printed JSON", () => {
    const now = Date.now();
    const list: Shortlist = {
      name: "Tech",
      createdAt: now,
      updatedAt: now,
      items: [makeItem({ addedAt: now })],
    };

    const json = exportShortlistJson(list);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("Tech");
    expect(parsed.items.length).toBe(1);
    // Verify pretty-printing (2-space indentation)
    expect(json).toContain("\n  ");
  });
});

// ── Summary ──

describe("getShortlistSummary", () => {
  it("generates markdown-formatted summary", () => {
    const now = Date.now();
    const list: Shortlist = {
      name: "My Picks",
      createdAt: now,
      updatedAt: now,
      items: [
        makeItem({ title: "Gadget Pro", price: 49.99, rating: 4.2, reviewCount: 300, addedAt: now }),
        makeItem({ asin: "B0TEST0002", title: "Widget X", price: null, rating: 3.8, reviewCount: 50, addedAt: now }),
      ],
    };

    const md = getShortlistSummary(list);
    expect(md).toContain("# My Picks");
    expect(md).toContain("**2 items**");
    expect(md).toContain("**Gadget Pro** — $49.99");
    expect(md).toContain("**Widget X** — N/A");
    expect(md).toContain("⭐ 4.2 (300 reviews)");
    expect(md).toContain("⭐ 3.8 (50 reviews)");
  });
});
