import { describe, it, expect } from "vitest";
import {
  extractMatchTokens,
  computeMatchConfidence,
  matchProductToRecalls,
} from "../src/recall/checker";
import type { CpscRecall } from "../src/recall/types";

function makeRecall(overrides: Partial<CpscRecall> = {}): CpscRecall {
  return {
    RecallID: 1,
    RecallNumber: "99999",
    RecallDate: "2025-06-01T00:00:00",
    Description: "Test recall description",
    URL: "https://www.cpsc.gov/Recalls/2025/test",
    Title: "Test Company Recalls Test Product",
    ConsumerContact: "1-800-TEST",
    LastPublishDate: "2025-06-01T00:00:00",
    Products: [{ Name: "Test Product", Description: "", Model: "TP-100", NumberOfUnits: "1000" }],
    Images: [],
    Injuries: [{ Name: "None reported" }],
    Hazards: [{ Name: "Choking hazard", HazardType: "Choking" }],
    Retailers: [],
    ManufacturerCountries: [{ Country: "China" }],
    ProductUPCs: [],
    ...overrides,
  };
}

// ── Token Extraction ────────────────────────────────────────────────

describe("extractMatchTokens", () => {
  it("extracts lowercase tokens and removes stop words", () => {
    const tokens = extractMatchTokens("The Best Baby Swing for Toddlers");
    expect(tokens).toContain("baby");
    expect(tokens).toContain("swing");
    expect(tokens).toContain("toddlers");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("for");
    expect(tokens).not.toContain("best");
  });

  it("removes punctuation and special characters", () => {
    const tokens = extractMatchTokens("Fisher-Price® Baby's First Blocks™");
    expect(tokens).toContain("fisher-price");
    expect(tokens).toContain("baby");
    expect(tokens).toContain("first");
    expect(tokens).toContain("blocks");
  });

  it("filters out single-character tokens", () => {
    const tokens = extractMatchTokens("A B C Big Product");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("b");
    expect(tokens).not.toContain("c");
    expect(tokens).toContain("big");
    expect(tokens).toContain("product");
  });
});

// ── Match Confidence ────────────────────────────────────────────────

describe("computeMatchConfidence", () => {
  it("returns high confidence for exact product name match", () => {
    const recall = makeRecall({
      Title: "Vevor Recalls Baby Swings",
      Products: [{ Name: "Vevor Baby Swings", Description: "", Model: "", NumberOfUnits: "1000" }],
    });

    const { confidence, matchedOn } = computeMatchConfidence(
      "VEVOR Baby Swing Electric Infant Cradle", "VEVOR", recall,
    );

    expect(confidence).toBeGreaterThan(0.4);
    expect(matchedOn).toContain("brand");
  });

  it("returns low confidence for unrelated products", () => {
    const recall = makeRecall({
      Title: "Company X Recalls Toasters Due to Fire Hazard",
      Products: [{ Name: "Electric Toaster Model X", Description: "", Model: "", NumberOfUnits: "500" }],
    });

    const { confidence } = computeMatchConfidence(
      "Baby Monitor with Camera and Night Vision", undefined, recall,
    );

    expect(confidence).toBeLessThan(0.3);
  });

  it("boosts confidence when recall was sold on Amazon", () => {
    const recallNoAmazon = makeRecall({
      Title: "Recalls Portable Heater Due to Fire Hazard",
      Products: [{ Name: "Portable Space Heater", Description: "", Model: "", NumberOfUnits: "100" }],
      Retailers: [{ Name: "Walmart" }],
    });
    const recallAmazon = makeRecall({
      Title: "Recalls Portable Heater Due to Fire Hazard",
      Products: [{ Name: "Portable Space Heater", Description: "", Model: "", NumberOfUnits: "100" }],
      Retailers: [{ Name: "Amazon.com for $49.99" }],
    });

    const scoreNoAmazon = computeMatchConfidence("Portable Space Heater Electric", undefined, recallNoAmazon);
    const scoreAmazon = computeMatchConfidence("Portable Space Heater Electric", undefined, recallAmazon);

    expect(scoreAmazon.confidence).toBeGreaterThanOrEqual(scoreNoAmazon.confidence);
    expect(scoreAmazon.matchedOn).toContain("sold-on-amazon");
  });

  it("boosts confidence when brand matches", () => {
    const recall = makeRecall({
      Title: "Graco Recalls Infant Swings",
      Products: [{ Name: "Graco Infant Swing", Description: "", Model: "", NumberOfUnits: "500" }],
    });

    const withBrand = computeMatchConfidence("Graco Baby Swing Soothing", "Graco", recall);
    const noBrand = computeMatchConfidence("Graco Baby Swing Soothing", undefined, recall);

    expect(withBrand.confidence).toBeGreaterThan(noBrand.confidence);
    expect(withBrand.matchedOn).toContain("brand");
  });
});

// ── Full Matching Pipeline ──────────────────────────────────────────

describe("matchProductToRecalls", () => {
  it("returns matching recalls sorted by confidence", () => {
    const recalls = [
      makeRecall({
        RecallID: 1,
        Title: "Recalls Baby Walker Due to Fall Hazard",
        Products: [{ Name: "Baby Walker Model A", Description: "", Model: "A", NumberOfUnits: "200" }],
      }),
      makeRecall({
        RecallID: 2,
        Title: "Recalls Baby Stroller Due to Wheel Detachment",
        Products: [{ Name: "Baby Stroller Deluxe", Description: "", Model: "D", NumberOfUnits: "300" }],
      }),
    ];

    const matches = matchProductToRecalls("Baby Walker with Wheels", undefined, recalls, 0.2);

    // Walker recall should match better than stroller
    expect(matches.length).toBeGreaterThanOrEqual(1);
    if (matches.length > 0) {
      expect(matches[0].recall.RecallID).toBe(1);
    }
  });

  it("returns empty array when no recalls match", () => {
    const recalls = [
      makeRecall({
        Title: "Recalls Electric Toaster Due to Fire Hazard",
        Products: [{ Name: "Electric Toaster", Description: "", Model: "", NumberOfUnits: "100" }],
      }),
    ];

    const matches = matchProductToRecalls("Wireless Bluetooth Headphones", undefined, recalls);
    expect(matches).toHaveLength(0);
  });

  it("filters by minimum confidence threshold", () => {
    const recalls = [
      makeRecall({
        Title: "Recalls Baby Toy",
        Products: [{ Name: "Baby Toy Set", Description: "", Model: "", NumberOfUnits: "100" }],
      }),
    ];

    const looseMatches = matchProductToRecalls("Baby Toy Educational", undefined, recalls, 0.1);
    const strictMatches = matchProductToRecalls("Baby Toy Educational", undefined, recalls, 0.9);

    expect(looseMatches.length).toBeGreaterThanOrEqual(strictMatches.length);
  });

  it("includes match details (matchedOn fields)", () => {
    const recalls = [
      makeRecall({
        Title: "Fisher-Price Recalls Baby Swings",
        Products: [{ Name: "Fisher-Price Baby Swing", Description: "", Model: "", NumberOfUnits: "100" }],
        Retailers: [{ Name: "Amazon.com" }],
      }),
    ];

    const matches = matchProductToRecalls(
      "Fisher-Price Baby Swing Soothing Motions", "Fisher-Price", recalls, 0.2,
    );

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].matchedOn.length).toBeGreaterThan(0);
  });
});
