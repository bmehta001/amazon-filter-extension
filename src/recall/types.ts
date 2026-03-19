/** Types for CPSC Product Recall data and matching. */

/** A single recall from the CPSC API response. */
export interface CpscRecall {
  RecallID: number;
  RecallNumber: string;
  RecallDate: string;
  Description: string;
  URL: string;
  Title: string;
  ConsumerContact: string;
  LastPublishDate: string;
  Products: { Name: string; Description: string; Model: string; NumberOfUnits: string }[];
  Images: { URL: string; Caption: string }[];
  Injuries: { Name: string }[];
  Hazards: { Name: string; HazardType?: string }[];
  Retailers: { Name: string }[];
  ManufacturerCountries: { Country: string }[];
  ProductUPCs: string[];
}

/** A recall matched to a specific Amazon product. */
export interface RecallMatch {
  /** The CPSC recall record. */
  recall: CpscRecall;
  /** Match confidence 0-1 (1 = strong match). */
  confidence: number;
  /** Which product fields matched. */
  matchedOn: string[];
}

/** Cached recall search results. */
export interface RecallCacheEntry {
  query: string;
  recalls: CpscRecall[];
  fetchedAt: number;
}
