/**
 * Product shortlist storage — persists named product shortlists in
 * chrome.storage.sync and provides CRUD + export helpers.
 */

/** A single item in a product shortlist. */
export interface ShortlistItem {
  /** Amazon ASIN. */
  asin: string;
  /** Product title (max 120 chars). */
  title: string;
  /** Brand name. */
  brand: string;
  /** Current price (null if unavailable). */
  price: number | null;
  /** Average star rating. */
  rating: number;
  /** Number of reviews. */
  reviewCount: number;
  /** Product URL. */
  url: string;
  /** Timestamp when the item was added. */
  addedAt: number;
  /** Deal quality score 0-100 (if available). */
  dealScore?: number;
  /** Review quality score 0-100 (if available). */
  reviewQuality?: number;
}

/** A named product shortlist. */
export interface Shortlist {
  name: string;
  items: ShortlistItem[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "bas_shortlists";
const MAX_LISTS = 20;
const MAX_ITEMS_PER_LIST = 50;

/** Serializes all storage operations to prevent read-modify-write races. */
let operationQueue: Promise<void> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const op = operationQueue.then(fn, fn); // run even if prior op rejected
  operationQueue = op.then(() => {}, () => {}); // swallow for queue chain
  return op;
}

/** Load all shortlists from chrome.storage.sync. */
export async function loadShortlists(): Promise<Shortlist[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        console.error("[BAS] Shortlist load error:", chrome.runtime.lastError.message);
        resolve([]);
        return;
      }
      resolve((result[STORAGE_KEY] as Shortlist[]) || []);
    });
  });
}

/** Save all shortlists to chrome.storage.sync. */
async function saveShortlists(lists: Shortlist[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: lists }, () => {
      if (chrome.runtime.lastError) {
        console.error("[BAS] Shortlist save error:", chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/** Create a new empty shortlist. */
export async function createShortlist(name: string): Promise<Shortlist> {
  return serialized(async () => {
    const lists = await loadShortlists();

    if (lists.some((l) => l.name === name)) {
      throw new Error(`Shortlist "${name}" already exists`);
    }
    if (lists.length >= MAX_LISTS) {
      throw new Error(`Maximum of ${MAX_LISTS} shortlists reached`);
    }

    const now = Date.now();
    const list: Shortlist = { name, items: [], createdAt: now, updatedAt: now };
    lists.push(list);
    await saveShortlists(lists);
    return list;
  });
}

/** Delete a shortlist by name. */
export async function deleteShortlist(name: string): Promise<void> {
  return serialized(async () => {
    const lists = await loadShortlists();
    await saveShortlists(lists.filter((l) => l.name !== name));
  });
}

/** Rename a shortlist. */
export async function renameShortlist(oldName: string, newName: string): Promise<void> {
  return serialized(async () => {
    const lists = await loadShortlists();

    if (lists.some((l) => l.name === newName)) {
      throw new Error(`Shortlist "${newName}" already exists`);
    }

    const list = lists.find((l) => l.name === oldName);
    if (!list) {
      throw new Error(`Shortlist "${oldName}" not found`);
    }

    list.name = newName;
    list.updatedAt = Date.now();
    await saveShortlists(lists);
  });
}

/** Add an item to a shortlist (skips duplicates by ASIN). */
export async function addToShortlist(listName: string, item: ShortlistItem): Promise<void> {
  return serialized(async () => {
    const lists = await loadShortlists();
    const list = lists.find((l) => l.name === listName);
    if (!list) {
      throw new Error(`Shortlist "${listName}" not found`);
    }

    // Skip duplicate ASINs
    if (list.items.some((i) => i.asin === item.asin)) return;

    if (list.items.length >= MAX_ITEMS_PER_LIST) {
      throw new Error(`Maximum of ${MAX_ITEMS_PER_LIST} items per shortlist reached`);
    }

    list.items.push({ ...item, title: item.title.slice(0, 120) });
    list.updatedAt = Date.now();
    await saveShortlists(lists);
  });
}

/** Remove an item from a shortlist by ASIN. */
export async function removeFromShortlist(listName: string, asin: string): Promise<void> {
  return serialized(async () => {
    const lists = await loadShortlists();
    const list = lists.find((l) => l.name === listName);
    if (!list) return;

    list.items = list.items.filter((i) => i.asin !== asin);
    list.updatedAt = Date.now();
    await saveShortlists(lists);
  });
}

/** Return names of all shortlists that contain the given ASIN. */
export async function isInAnyShortlist(asin: string): Promise<string[]> {
  const lists = await loadShortlists();
  return lists.filter((l) => l.items.some((i) => i.asin === asin)).map((l) => l.name);
}

/** Escape a CSV field value. */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Generate a CSV string for a shortlist. */
export function exportShortlistCsv(list: Shortlist): string {
  const headers = [
    "ASIN",
    "Title",
    "Brand",
    "Price",
    "Rating",
    "Reviews",
    "URL",
    "Added",
    "Deal Score",
    "Review Quality",
  ];

  const rows = list.items.map((item) =>
    [
      csvEscape(item.asin),
      csvEscape(item.title),
      csvEscape(item.brand),
      item.price !== null ? String(item.price) : "",
      String(item.rating),
      String(item.reviewCount),
      csvEscape(item.url),
      new Date(item.addedAt).toISOString(),
      item.dealScore !== undefined ? String(item.dealScore) : "",
      item.reviewQuality !== undefined ? String(item.reviewQuality) : "",
    ].join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

/** Generate a pretty-printed JSON string for a shortlist. */
export function exportShortlistJson(list: Shortlist): string {
  return JSON.stringify(list, null, 2);
}

/** Generate a markdown-formatted summary for clipboard. */
export function getShortlistSummary(list: Shortlist): string {
  const lines: string[] = [];
  lines.push(`# ${list.name}`);
  lines.push(`**${list.items.length} items** — updated ${new Date(list.updatedAt).toLocaleDateString()}`);
  lines.push("");

  for (const item of list.items) {
    const price = item.price !== null ? `$${item.price.toFixed(2)}` : "N/A";
    lines.push(`- **${item.title}** — ${price} ⭐ ${item.rating} (${item.reviewCount} reviews)`);
  }

  return lines.join("\n");
}
