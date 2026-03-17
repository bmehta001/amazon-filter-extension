import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveNetworkUsage } from "../src/util/network";

describe("resolveNetworkUsage", () => {
  afterEach(() => {
    // Clean up any navigator.connection mock
    vi.restoreAllMocks();
  });

  it("returns 'full' when setting is 'full'", () => {
    expect(resolveNetworkUsage("full")).toBe("full");
  });

  it("returns 'minimal' when setting is 'minimal'", () => {
    expect(resolveNetworkUsage("minimal")).toBe("minimal");
  });

  it("returns 'full' when auto and no connection API", () => {
    // Default: navigator.connection is undefined
    expect(resolveNetworkUsage("auto")).toBe("full");
  });

  it("returns 'minimal' when auto and saveData is true", () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true, effectiveType: "4g", downlink: 10 },
      configurable: true,
    });
    expect(resolveNetworkUsage("auto")).toBe("minimal");
  });

  it("returns 'minimal' when auto and effectiveType is 2g", () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: false, effectiveType: "2g", downlink: 0.5 },
      configurable: true,
    });
    expect(resolveNetworkUsage("auto")).toBe("minimal");
  });

  it("returns 'minimal' when auto and effectiveType is slow-2g", () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: false, effectiveType: "slow-2g", downlink: 0.1 },
      configurable: true,
    });
    expect(resolveNetworkUsage("auto")).toBe("minimal");
  });

  it("returns 'minimal' when auto and downlink < 1 Mbps", () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: false, effectiveType: "3g", downlink: 0.5 },
      configurable: true,
    });
    expect(resolveNetworkUsage("auto")).toBe("minimal");
  });

  it("returns 'full' when auto and connection is good", () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: false, effectiveType: "4g", downlink: 10 },
      configurable: true,
    });
    expect(resolveNetworkUsage("auto")).toBe("full");
  });
});
