import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Chrome storage mock (local) ──────────────────────────────────────

type StorageCallback = (result: Record<string, unknown>) => void;
type SetCallback = (() => void) | undefined;

let storedData: Record<string, unknown> = {};

vi.stubGlobal("chrome", {
  storage: {
    sync: {
      get(_keys: unknown, cb: StorageCallback) { cb({}); },
      set(_data: unknown, cb?: SetCallback) { cb?.(); },
    },
    local: {
      get(keys: string[], cb: StorageCallback) {
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
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined },
});

const {
  loadOnboardingState,
  markWelcomeSeen,
  markTourSeen,
  shouldShowTour,
} = await import("../src/onboarding/state");

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  storedData = {};
});

describe("loadOnboardingState", () => {
  it("returns defaults when storage is empty", async () => {
    const state = await loadOnboardingState();
    expect(state).toEqual({
      hasSeenWelcome: false,
      hasSeenTour: false,
      installDate: 0,
    });
  });

  it("returns stored state when present", async () => {
    storedData = {
      onboardingState: {
        hasSeenWelcome: true,
        hasSeenTour: false,
        installDate: 1700000000000,
      },
    };
    const state = await loadOnboardingState();
    expect(state.hasSeenWelcome).toBe(true);
    expect(state.hasSeenTour).toBe(false);
    expect(state.installDate).toBe(1700000000000);
  });

  it("merges partial stored data with defaults", async () => {
    storedData = {
      onboardingState: { hasSeenWelcome: true },
    };
    const state = await loadOnboardingState();
    expect(state.hasSeenWelcome).toBe(true);
    expect(state.hasSeenTour).toBe(false);
    expect(state.installDate).toBe(0);
  });
});

describe("markWelcomeSeen", () => {
  it("sets hasSeenWelcome to true", async () => {
    await markWelcomeSeen();
    const state = await loadOnboardingState();
    expect(state.hasSeenWelcome).toBe(true);
  });

  it("sets installDate when not already set", async () => {
    await markWelcomeSeen();
    const state = await loadOnboardingState();
    expect(state.installDate).toBeGreaterThan(0);
  });

  it("preserves existing installDate", async () => {
    storedData = {
      onboardingState: {
        hasSeenWelcome: false,
        hasSeenTour: false,
        installDate: 1700000000000,
      },
    };
    await markWelcomeSeen();
    const state = await loadOnboardingState();
    expect(state.installDate).toBe(1700000000000);
  });
});

describe("markTourSeen", () => {
  it("sets hasSeenTour to true", async () => {
    await markTourSeen();
    const state = await loadOnboardingState();
    expect(state.hasSeenTour).toBe(true);
  });

  it("does not modify other fields", async () => {
    storedData = {
      onboardingState: {
        hasSeenWelcome: true,
        hasSeenTour: false,
        installDate: 1700000000000,
      },
    };
    await markTourSeen();
    const state = await loadOnboardingState();
    expect(state.hasSeenWelcome).toBe(true);
    expect(state.installDate).toBe(1700000000000);
  });
});

describe("shouldShowTour", () => {
  it("returns false when nothing has been seen", async () => {
    expect(await shouldShowTour()).toBe(false);
  });

  it("returns true when welcome seen but tour not seen", async () => {
    await markWelcomeSeen();
    expect(await shouldShowTour()).toBe(true);
  });

  it("returns false when both welcome and tour have been seen", async () => {
    await markWelcomeSeen();
    await markTourSeen();
    expect(await shouldShowTour()).toBe(false);
  });

  it("returns false when only tour is seen (edge case)", async () => {
    storedData = {
      onboardingState: {
        hasSeenWelcome: false,
        hasSeenTour: true,
        installDate: 0,
      },
    };
    expect(await shouldShowTour()).toBe(false);
  });
});
