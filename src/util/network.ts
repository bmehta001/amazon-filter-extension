/**
 * Detects whether the current connection supports background data fetching.
 * Uses the Network Information API when available.
 */

import type { NetworkUsage } from "../types";

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
}

/**
 * Determine the effective network usage mode.
 * - "full" or "minimal" → return as-is (user explicitly chose)
 * - "auto" → detect connection quality and decide
 */
export function resolveNetworkUsage(setting: NetworkUsage): "full" | "minimal" {
  if (setting === "full") return "full";
  if (setting === "minimal") return "minimal";

  // Auto-detect
  const conn = (navigator as unknown as { connection?: NetworkInformation }).connection;
  if (!conn) return "full"; // API unavailable — assume good connection

  if (conn.saveData) return "minimal";

  if (conn.effectiveType === "2g" || conn.effectiveType === "slow-2g") {
    return "minimal";
  }

  if (conn.downlink !== undefined && conn.downlink < 1) {
    return "minimal";
  }

  return "full";
}
