/**
 * FBA Reseller Tools — BSR-to-sales estimates, margin calculator,
 * and competition density analysis for Amazon FBA sellers/resellers.
 */

import type { BsrInfo, Product } from "../types";

// ── BSR to Monthly Sales Estimate ────────────────────────────────────

const BSR_SALES_CURVES: Record<string, [number, number][]> = {
  "default": [
    [1, 10000], [10, 5000], [50, 3000], [100, 2000], [250, 1200],
    [500, 800], [1000, 500], [2500, 250], [5000, 150], [10000, 80],
    [25000, 40], [50000, 20], [100000, 10], [250000, 4], [500000, 2],
    [1000000, 1],
  ],
  "Electronics": [
    [1, 8000], [10, 4000], [50, 2500], [100, 1500], [250, 900],
    [500, 600], [1000, 400], [2500, 200], [5000, 100], [10000, 60],
    [25000, 30], [50000, 15], [100000, 8], [250000, 3], [500000, 1],
  ],
  "Home & Kitchen": [
    [1, 12000], [10, 6000], [50, 3500], [100, 2500], [250, 1500],
    [500, 1000], [1000, 600], [2500, 300], [5000, 180], [10000, 100],
    [25000, 50], [50000, 25], [100000, 12], [250000, 5], [500000, 2],
  ],
  "Toys & Games": [
    [1, 9000], [10, 4500], [50, 2800], [100, 1800], [250, 1000],
    [500, 700], [1000, 450], [2500, 220], [5000, 130], [10000, 70],
    [25000, 35], [50000, 18], [100000, 9], [250000, 3], [500000, 1],
  ],
};

export function estimateMonthlySales(bsr: BsrInfo): { estimate: number; confidence: "high" | "medium" | "low" } {
  const curve = BSR_SALES_CURVES[bsr.category] ?? BSR_SALES_CURVES["default"];
  const rank = bsr.rank;

  for (let i = 0; i < curve.length - 1; i++) {
    const [r1, s1] = curve[i];
    const [r2, s2] = curve[i + 1];
    if (rank >= r1 && rank <= r2) {
      const t = Math.log(rank / r1) / Math.log(r2 / r1);
      const estimate = Math.round(s1 * Math.pow(s2 / s1, t));
      const confidence = rank <= 10000 ? "high" : rank <= 100000 ? "medium" : "low";
      return { estimate, confidence };
    }
  }

  if (rank < curve[0][0]) return { estimate: curve[0][1], confidence: "high" };
  return { estimate: 1, confidence: "low" };
}

// ── FBA Margin Calculator ────────────────────────────────────────────

export interface MarginCalculation {
  sellingPrice: number;
  cost: number;
  referralFee: number;
  fbaFee: number;
  estimatedProfit: number;
  marginPercent: number;
  isViable: boolean;
}

export function calculateMargin(sellingPrice: number, cost: number, weight = 1): MarginCalculation {
  const referralFee = Math.round(sellingPrice * 0.15 * 100) / 100;

  let fbaFee: number;
  if (weight <= 0.25) fbaFee = 3.22;
  else if (weight <= 0.5) fbaFee = 3.40;
  else if (weight <= 1) fbaFee = 3.86;
  else if (weight <= 1.5) fbaFee = 4.08;
  else if (weight <= 2) fbaFee = 4.76;
  else if (weight <= 3) fbaFee = 5.40;
  else fbaFee = 5.40 + Math.ceil(weight - 3) * 0.40;

  const estimatedProfit = Math.round((sellingPrice - cost - referralFee - fbaFee) * 100) / 100;
  const marginPercent = sellingPrice > 0 ? Math.round((estimatedProfit / sellingPrice) * 100) : 0;

  return { sellingPrice, cost, referralFee, fbaFee, estimatedProfit, marginPercent, isViable: marginPercent >= 20 };
}

// ── Competition Analysis ─────────────────────────────────────────────

export interface CompetitionAnalysis {
  sellerCount: number;
  competitionLevel: "low" | "medium" | "high";
  hasFba: boolean;
  hasAmazon: boolean;
}

export function analyzeCompetition(product: Product): CompetitionAnalysis {
  const seller = product.seller;
  const sellerCount = seller?.otherSellersCount ?? 0;
  const competitionLevel = sellerCount <= 2 ? "low" : sellerCount <= 5 ? "medium" : "high";

  return {
    sellerCount: sellerCount + 1,
    competitionLevel,
    hasFba: seller?.fulfillment === "fba" || seller?.fulfillment === "amazon",
    hasAmazon: seller?.fulfillment === "amazon",
  };
}

// ── Reseller Summary ─────────────────────────────────────────────────

export interface ResellerSummary {
  bsr: BsrInfo;
  monthlySales: { estimate: number; confidence: string };
  competition: CompetitionAnalysis;
  marginScenarios: MarginCalculation[];
}

export function buildResellerSummary(product: Product): ResellerSummary | null {
  if (!product.bsr || !product.price) return null;

  return {
    bsr: product.bsr,
    monthlySales: estimateMonthlySales(product.bsr),
    competition: analyzeCompetition(product),
    marginScenarios: [
      calculateMargin(product.price, product.price * 0.25),
      calculateMargin(product.price, product.price * 0.33),
      calculateMargin(product.price, product.price * 0.50),
    ],
  };
}
