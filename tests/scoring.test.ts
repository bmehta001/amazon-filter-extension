import { describe, it, expect } from "vitest";
import { suspiciousScore, isSuspicious, SUSPICIOUS_THRESHOLD } from "../src/brand/scoring";

describe("suspiciousScore", () => {
  it("returns low score for known legitimate brands", () => {
    expect(suspiciousScore("Samsung")).toBeLessThan(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("Apple")).toBeLessThan(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("Nike")).toBeLessThan(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("Adidas")).toBeLessThan(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("Under Armour")).toBeLessThan(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("Burt's Bees")).toBeLessThan(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("LEGO")).toBeLessThan(SUSPICIOUS_THRESHOLD);
  });

  it("returns high score for gibberish brand names", () => {
    expect(suspiciousScore("XKZTQ")).toBeGreaterThanOrEqual(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("BGHTP")).toBeGreaterThanOrEqual(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("QWRST")).toBeGreaterThanOrEqual(SUSPICIOUS_THRESHOLD);
  });

  it("returns 1 for empty brand names", () => {
    expect(suspiciousScore("")).toBe(1);
    expect(suspiciousScore("   ")).toBe(1);
  });

  it("flags names with excessive special characters", () => {
    expect(suspiciousScore("@#$%^&*")).toBeGreaterThanOrEqual(SUSPICIOUS_THRESHOLD);
  });

  it("handles ALL CAPS brands correctly", () => {
    // ALL CAPS is a common brand convention — should NOT flag as suspicious
    expect(suspiciousScore("SAMSUNG")).toBeLessThan(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("NIKE")).toBeLessThan(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("ADIDAS")).toBeLessThan(SUSPICIOUS_THRESHOLD);
  });

  it("handles title case brands correctly", () => {
    expect(suspiciousScore("Under Armour")).toBeLessThan(SUSPICIOUS_THRESHOLD);
    expect(suspiciousScore("Ralph Lauren")).toBeLessThan(SUSPICIOUS_THRESHOLD);
  });
});

describe("isSuspicious", () => {
  it("returns false for legitimate brands", () => {
    expect(isSuspicious("Sony")).toBe(false);
    expect(isSuspicious("Panasonic")).toBe(false);
  });

  it("returns true for gibberish names", () => {
    expect(isSuspicious("XKZTQ")).toBe(true);
    expect(isSuspicious("BGHTP")).toBe(true);
  });
});
