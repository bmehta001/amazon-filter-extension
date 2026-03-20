/**
 * Export filtered search results as CSV, JSON, or clipboard text.
 *
 * Aggregates product data with all available enrichment maps so the
 * exported data includes trust scores, deal quality, seller info, etc.
 */

import type { Product, SellerInfo } from "../types";
import type { ReviewScore } from "../review/types";
import type { TrustScoreResult } from "../review/trustScore";
import type { SellerTrustResult } from "../seller/trust";
import type { ListingIntegrityResult } from "../seller/listingSignals";
import type { ReviewSummary } from "../review/summary";

/** Enrichment data maps that can be attached per-ASIN. */
export interface EnrichmentMaps {
  reviewScoreMap: Map<string, ReviewScore>;
  trustScoreMap: Map<string, TrustScoreResult>;
  sellerTrustMap: Map<string, SellerTrustResult>;
  listingIntegrityMap: Map<string, ListingIntegrityResult>;
  originMap: Map<string, string>;
  dealScoreMap: Map<string, number>;
  summaryMap: Map<string, ReviewSummary>;
}

/** A flat, serializable row for one product. */
export interface ExportRow {
  asin: string;
  title: string;
  brand: string;
  price: number | null;
  listPrice: number | null;
  rating: number;
  reviewCount: number;
  isSponsored: boolean;
  seller: string;
  fulfillment: string;
  countryOfOrigin: string;
  reviewQuality: number | null;
  trustScore: number | null;
  sellerTrust: number | null;
  listingIntegrity: number | null;
  dealScore: number | null;
  reviewSummary: string;
  url: string;
}

/** Build export rows from visible products + enrichment maps. */
export function buildExportRows(
  products: Product[],
  maps: EnrichmentMaps,
): ExportRow[] {
  return products
    .filter((p) => p.asin)
    .map((p) => {
      const asin = p.asin!;
      const reviewScore = maps.reviewScoreMap.get(asin);
      const trust = maps.trustScoreMap.get(asin);
      const sellerTrust = maps.sellerTrustMap.get(asin);
      const listing = maps.listingIntegrityMap.get(asin);
      const summary = maps.summaryMap.get(asin);

      return {
        asin,
        title: p.title,
        brand: p.brand,
        price: p.price,
        listPrice: p.listPrice ?? null,
        rating: p.rating,
        reviewCount: p.reviewCount,
        isSponsored: p.isSponsored,
        seller: p.seller?.sellerName ?? "",
        fulfillment: p.seller?.fulfillment ?? "",
        countryOfOrigin: p.countryOfOrigin ?? maps.originMap.get(asin) ?? "",
        reviewQuality: reviewScore?.score ?? null,
        trustScore: trust?.score ?? null,
        sellerTrust: sellerTrust?.score ?? null,
        listingIntegrity: listing?.score ?? null,
        dealScore: maps.dealScoreMap.get(asin) ?? null,
        reviewSummary: summary?.oneLiner ?? "",
        url: `https://www.amazon.com/dp/${asin}`,
      };
    });
}

// ── CSV ──────────────────────────────────────────────────────────────

const CSV_HEADERS: (keyof ExportRow)[] = [
  "asin", "title", "brand", "price", "listPrice", "rating", "reviewCount",
  "isSponsored", "seller", "fulfillment", "countryOfOrigin",
  "reviewQuality", "trustScore", "sellerTrust", "listingIntegrity",
  "dealScore", "reviewSummary", "url",
];

const CSV_LABELS: Record<string, string> = {
  asin: "ASIN",
  title: "Title",
  brand: "Brand",
  price: "Price",
  listPrice: "List Price",
  rating: "Rating",
  reviewCount: "Reviews",
  isSponsored: "Sponsored",
  seller: "Seller",
  fulfillment: "Fulfillment",
  countryOfOrigin: "Country of Origin",
  reviewQuality: "Review Quality",
  trustScore: "Trust Score",
  sellerTrust: "Seller Trust",
  listingIntegrity: "Listing Integrity",
  dealScore: "Deal Score",
  reviewSummary: "Review Summary",
  url: "URL",
};

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function exportToCsv(rows: ExportRow[]): string {
  const header = CSV_HEADERS.map((h) => CSV_LABELS[h] ?? h).join(",");
  const lines = rows.map((row) =>
    CSV_HEADERS.map((h) => csvEscape(cellToString(row[h]))).join(","),
  );
  return [header, ...lines].join("\n");
}

// ── JSON ─────────────────────────────────────────────────────────────

export function exportToJson(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

// ── Clipboard (tab-separated for spreadsheet paste) ──────────────────

export function exportToClipboard(rows: ExportRow[]): string {
  const header = CSV_HEADERS.map((h) => CSV_LABELS[h] ?? h).join("\t");
  const lines = rows.map((row) =>
    CSV_HEADERS.map((h) => cellToString(row[h])).join("\t"),
  );
  return [header, ...lines].join("\n");
}

// ── Download helper ──────────────────────────────────────────────────

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Get a filename based on the current search query. */
export function getExportFilename(ext: string): string {
  const params = new URLSearchParams(window.location.search);
  const query = params.get("k") ?? "search";
  const safe = query.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `amazon_${safe}_${date}.${ext}`;
}
