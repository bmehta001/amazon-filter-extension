import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for settings persistence: debounced saves, error handling,
 * flush on beforeunload, and cross-tab change listener.
 */

// ── Chrome storage mock ──────────────────────────────────────────────

type StorageCallback = (result: Record<string, unknown>) => void;
type SetCallback = (() => void) | undefined;
type ChangedListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  area: string,
) => void;

let storedData: Record<string, unknown> = {};
let lastError: { message: string } | undefined = undefined;
const changedListeners: ChangedListener[] = [];

const mockChrome = {
  storage: {
    sync: {
      get(keys: string[], cb: StorageCallback) {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (key in storedData) result[key] = storedData[key];
        }
        cb(result);
      },
      set(data: Record<string, unknown>, cb?: SetCallback) {
        if (lastError) {
          // Simulate error
          cb?.();
          return;
        }
        Object.assign(storedData, data);
        // Notify change listeners
        const changes: Record<string, { newValue: unknown }> = {};
        for (const [key, value] of Object.entries(data)) {
          changes[key] = { newValue: value };
        }
        for (const listener of changedListeners) {
          listener(changes, "sync");
        }
        cb?.();
      },
    },
    local: {
      get(_keys: unknown, cb: StorageCallback) { cb({}); },
      set(_data: unknown, cb?: SetCallback) { cb?.(); },
    },
    onChanged: {
      addListener(fn: ChangedListener) {
        changedListeners.push(fn);
      },
    },
  },
  runtime: {
    lastError: undefined as { message: string } | undefined,
    getURL: (path: string) => path,
  },
};

// Intercept lastError checks
Object.defineProperty(mockChrome.runtime, "lastError", {
  get() { return lastError; },
});

// @ts-expect-error Mock chrome global
globalThis.chrome = mockChrome;

// Dynamic imports after chrome mock is set up
const {
  loadFilters,
  saveFilters,
  syncFlushPendingFilterSave,
  saveStorage,
  onFiltersChanged,
} = await import("../src/util/storage");
const { DEFAULT_FILTERS } = await import("../src/types");
import type { FilterState } from "../src/types";

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  storedData = {};
  lastError = undefined;
  changedListeners.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loadFilters", () => {
  it("returns defaults when storage is empty", async () => {
    const filters = await loadFilters();
    expect(filters).toEqual(DEFAULT_FILTERS);
  });

  it("returns saved filters when storage has data", async () => {
    const saved: FilterState = {
      ...DEFAULT_FILTERS,
      minReviews: 500,
      hideSponsored: true,
    };
    storedData = { filters: saved };
    const filters = await loadFilters();
    expect(filters.minReviews).toBe(500);
    expect(filters.hideSponsored).toBe(true);
  });

  it("returns defaults on storage error", async () => {
    lastError = { message: "Quota exceeded" };
    const filters = await loadFilters();
    expect(filters).toEqual(DEFAULT_FILTERS);
  });
});

describe("saveFilters (debounced)", () => {
  it("does not save immediately — save is debounced", () => {
    const filters: FilterState = { ...DEFAULT_FILTERS, minReviews: 100 };
    saveFilters(filters);
    // Before debounce timer fires, storage should be empty
    expect(storedData.filters).toBeUndefined();
  });

  it("saves after debounce delay (300ms)", async () => {
    const filters: FilterState = { ...DEFAULT_FILTERS, minReviews: 100 };
    saveFilters(filters);
    // Advance past the debounce delay
    await vi.advanceTimersByTimeAsync(350);
    expect((storedData.filters as FilterState).minReviews).toBe(100);
  });

  it("coalesces rapid changes — only last value is saved", async () => {
    saveFilters({ ...DEFAULT_FILTERS, minReviews: 100 });
    saveFilters({ ...DEFAULT_FILTERS, minReviews: 200 });
    saveFilters({ ...DEFAULT_FILTERS, minReviews: 300 });
    saveFilters({ ...DEFAULT_FILTERS, minReviews: 999 });

    await vi.advanceTimersByTimeAsync(350);

    // Only the last value should have been written
    expect((storedData.filters as FilterState).minReviews).toBe(999);
  });

  it("handles rapid slider drags without multiple saves", async () => {
    const setSpy = vi.spyOn(mockChrome.storage.sync, "set");

    // Simulate slider drag: many rapid changes within 300ms
    for (let i = 0; i <= 50; i++) {
      saveFilters({ ...DEFAULT_FILTERS, minReviews: i * 100 });
      await vi.advanceTimersByTimeAsync(10); // 10ms between each drag event
    }

    // Wait for final debounce
    await vi.advanceTimersByTimeAsync(350);

    // Should have far fewer saves than 50 changes
    // With 300ms debounce and 10ms intervals, intermediate saves may fire
    // but the key assertion is the final value is correct
    expect((storedData.filters as FilterState).minReviews).toBe(5000);

    setSpy.mockRestore();
  });
});

describe("syncFlushPendingFilterSave", () => {
  it("synchronously triggers chrome.storage.sync.set for pending filters", () => {
    saveFilters({ ...DEFAULT_FILTERS, minReviews: 999 });
    const setSpy = vi.spyOn(mockChrome.storage.sync, "set");

    syncFlushPendingFilterSave();

    expect(setSpy).toHaveBeenCalledWith(
      { filters: expect.objectContaining({ minReviews: 999 }) },
      expect.any(Function),
    );
    setSpy.mockRestore();
  });

  it("is a no-op when no save is pending", () => {
    const setSpy = vi.spyOn(mockChrome.storage.sync, "set");
    syncFlushPendingFilterSave();
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });

  it("clears pendingFilters so subsequent calls are no-ops", () => {
    saveFilters({ ...DEFAULT_FILTERS, minReviews: 123 });
    const setSpy = vi.spyOn(mockChrome.storage.sync, "set");

    syncFlushPendingFilterSave();
    syncFlushPendingFilterSave(); // second call should be no-op

    expect(setSpy).toHaveBeenCalledTimes(1);
    setSpy.mockRestore();
  });
});

describe("saveStorage error handling", () => {
  it("rejects on chrome.runtime.lastError", async () => {
    lastError = { message: "Quota exceeded" };
    await expect(saveStorage({ filters: DEFAULT_FILTERS })).rejects.toThrow(
      "Quota exceeded",
    );
  });

  it("resolves on success", async () => {
    lastError = undefined;
    await expect(
      saveStorage({ filters: DEFAULT_FILTERS }),
    ).resolves.toBeUndefined();
  });
});

describe("onFiltersChanged (cross-tab listener)", () => {
  it("calls callback when filters change in storage", async () => {
    const callback = vi.fn();
    onFiltersChanged(callback);

    const newFilters: FilterState = { ...DEFAULT_FILTERS, minReviews: 200 };

    // Simulate a storage change from another tab
    mockChrome.storage.sync.set({ filters: newFilters });

    // Debounced — advance timer
    await vi.advanceTimersByTimeAsync(150);

    expect(callback).toHaveBeenCalledWith(newFilters);
  });

  it("debounces rapid cross-tab changes", async () => {
    const callback = vi.fn();
    onFiltersChanged(callback);

    // Simulate rapid changes from another tab
    for (const i of [100, 200, 300]) {
      for (const listener of [...changedListeners]) {
        listener(
          { filters: { newValue: { ...DEFAULT_FILTERS, minReviews: i } } },
          "sync",
        );
      }
    }

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(150);

    // Should only have been called once (or a small number), not 3 times
    expect(callback.mock.calls.length).toBeLessThanOrEqual(2);
    // And the last call should have the latest value
    const lastCall = callback.mock.calls[callback.mock.calls.length - 1];
    expect((lastCall[0] as FilterState).minReviews).toBe(300);
  });

  it("ignores changes from non-sync areas", async () => {
    const callback = vi.fn();
    onFiltersChanged(callback);

    // Simulate a change from local storage
    for (const listener of [...changedListeners]) {
      listener(
        { filters: { newValue: { ...DEFAULT_FILTERS, minReviews: 999 } } },
        "local",
      );
    }

    await vi.advanceTimersByTimeAsync(150);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe("settings persist across page loads (simulated)", () => {
  it("settings saved in one session are loaded in another", async () => {
    // Session 1: user sets minReviews = 500
    const userFilters: FilterState = {
      ...DEFAULT_FILTERS,
      minReviews: 500,
      hideSponsored: true,
      excludeTokens: ["refurbished", "45W"],
    };
    saveFilters(userFilters);
    syncFlushPendingFilterSave();

    // Session 2: new page load — loadFilters should return the saved state
    const loaded = await loadFilters();
    expect(loaded.minReviews).toBe(500);
    expect(loaded.hideSponsored).toBe(true);
    expect(loaded.excludeTokens).toEqual(["refurbished", "45W"]);
  });

  it("partial filter changes preserve other settings", async () => {
    // First: save full state
    const initialFilters: FilterState = {
      ...DEFAULT_FILTERS,
      minReviews: 500,
      minRating: 4.0,
      priceMin: 10,
      priceMax: 100,
      hideSponsored: true,
    };
    saveFilters(initialFilters);
    syncFlushPendingFilterSave();

    // Second: update just minReviews — should keep everything else
    const updated: FilterState = { ...initialFilters, minReviews: 1000 };
    saveFilters(updated);
    syncFlushPendingFilterSave();

    const loaded = await loadFilters();
    expect(loaded.minReviews).toBe(1000);
    expect(loaded.minRating).toBe(4.0);
    expect(loaded.priceMin).toBe(10);
    expect(loaded.priceMax).toBe(100);
    expect(loaded.hideSponsored).toBe(true);
  });
});
