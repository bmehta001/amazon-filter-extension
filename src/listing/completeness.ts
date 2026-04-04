/**
 * Listing completeness analysis — checks product detail pages for key
 * information fields and scores listing quality based on what's present
 * vs. what's expected for the product's category.
 */

// ── Types ────────────────────────────────────────────────────────────

/** Individual info field presence check. */
export interface ListingField {
  id: string;
  label: string;
  present: boolean;
  /** How important this field is for the detected category. */
  importance: "required" | "recommended" | "optional";
}

/** Completeness analysis result for a product listing. */
export interface ListingCompleteness {
  /** Overall completeness score 0-100. */
  score: number;
  /** Quality tier. */
  label: "complete" | "good" | "sparse" | "poor";
  /** Color for badge. */
  color: "green" | "gray" | "orange" | "red";
  /** Individual field results. */
  fields: ListingField[];
  /** Department used for expectations (null = generic). */
  department: string | null;
  /** Count of present fields. */
  presentCount: number;
  /** Count of total checked fields. */
  totalCount: number;
  /** Count of missing required/recommended fields. */
  missingImportantCount: number;
}

import { $, $$, LISTING } from "../selectors";

// ── Field Detection ──────────────────────────────────────────────────

/** All fields we can detect on a product detail page. */
const FIELD_DETECTORS: { id: string; label: string; detect: (doc: Document) => boolean }[] = [
  {
    id: "dimensions",
    label: "Product Dimensions",
    detect: (doc) => hasDetailField(doc, /dimensions|product\s+size/i),
  },
  {
    id: "weight",
    label: "Item Weight",
    detect: (doc) => hasDetailField(doc, /item\s+weight|shipping\s+weight|product\s+weight/i),
  },
  {
    id: "materials",
    label: "Material/Fabric",
    detect: (doc) => hasDetailField(doc, /material|fabric\s+type|composition/i),
  },
  {
    id: "ingredients",
    label: "Ingredients",
    detect: (doc) => hasDetailField(doc, /ingredients?/i) || hasSection(doc, /ingredients?/i),
  },
  {
    id: "warranty",
    label: "Warranty Info",
    detect: (doc) => hasDetailField(doc, /warranty|guarantee/i) || hasSection(doc, /warranty/i),
  },
  {
    id: "manufacturer",
    label: "Manufacturer",
    detect: (doc) => hasDetailField(doc, /manufacturer/i),
  },
  {
    id: "model-number",
    label: "Model Number",
    detect: (doc) => hasDetailField(doc, /model\s+(?:number|name|#)|item\s+model/i),
  },
  {
    id: "upc-ean",
    label: "UPC/EAN",
    detect: (doc) => hasDetailField(doc, /upc|ean|gtin|barcode/i),
  },
  {
    id: "spec-table",
    label: "Specifications Table",
    detect: (doc) => $$(doc, ...LISTING.specTable).length > 0,
  },
  {
    id: "description",
    label: "Product Description",
    detect: (doc) => {
      const desc = $(doc, ...LISTING.description);
      if (!desc) return false;
      const text = desc.textContent?.trim() || "";
      return text.length > 50;
    },
  },
  {
    id: "images",
    label: "Multiple Images (3+)",
    detect: (doc) => $$(doc, ...LISTING.images).length >= 3,
  },
  {
    id: "bullet-points",
    label: "Feature Bullet Points",
    detect: (doc) => $$(doc, ...LISTING.bulletPoints).length >= 3,
  },
];

/** Check if a detail table/section contains a row matching the pattern. */
function hasDetailField(doc: Document, pattern: RegExp): boolean {
  // Strategy 1: Product details tables
  const tables = $$(doc, ...LISTING.detailTables);
  for (const el of tables) {
    if (pattern.test(el.textContent || "")) return true;
  }

  // Strategy 2: Tech spec table
  const techRows = $$(doc, ...LISTING.techSpec);
  for (const row of techRows) {
    if (pattern.test(row.textContent || "")) return true;
  }

  return false;
}

/** Check if a named section exists with content. */
function hasSection(doc: Document, pattern: RegExp): boolean {
  const headings = $$(doc, ...LISTING.headings);
  for (const h of headings) {
    const text = h.textContent || "";
    if (pattern.test(text)) {
      const next = h.nextElementSibling;
      if (next && (next.textContent?.trim().length ?? 0) > 10) return true;
    }
  }
  return false;
}

// ── Category-Specific Expectations ───────────────────────────────────

interface CategoryExpectations {
  required: string[];
  recommended: string[];
}

const CATEGORY_EXPECTATIONS: Record<string, CategoryExpectations> = {
  "172282": { // Electronics
    required: ["dimensions", "weight", "manufacturer", "model-number", "spec-table"],
    recommended: ["warranty", "description", "images", "bullet-points"],
  },
  "7141123011": { // Clothing
    required: ["materials", "dimensions"],
    recommended: ["images", "description", "bullet-points"],
  },
  "1055398": { // Home & Kitchen
    required: ["dimensions", "weight", "materials"],
    recommended: ["description", "images", "bullet-points", "warranty"],
  },
  "165796011": { // Baby
    required: ["materials", "weight", "manufacturer"],
    recommended: ["dimensions", "description", "images", "warranty", "bullet-points"],
  },
  "3375251": { // Sports & Outdoors
    required: ["dimensions", "weight", "materials"],
    recommended: ["description", "images", "bullet-points", "warranty"],
  },
  "16310101": { // Grocery
    required: ["ingredients", "weight"],
    recommended: ["description", "images", "manufacturer", "bullet-points"],
  },
  "228013": { // Tools
    required: ["dimensions", "weight", "manufacturer", "model-number"],
    recommended: ["spec-table", "warranty", "description", "images", "bullet-points"],
  },
  "3760911": { // Beauty
    required: ["ingredients", "weight"],
    recommended: ["description", "images", "manufacturer", "bullet-points"],
  },
  "283155": { // Books
    required: ["dimensions", "manufacturer"],
    recommended: ["description", "images"],
  },
  "2619525011": { // Toys & Games
    required: ["dimensions", "weight", "manufacturer"],
    recommended: ["description", "images", "bullet-points", "materials"],
  },
};

const DEFAULT_EXPECTATIONS: CategoryExpectations = {
  required: ["description", "images", "bullet-points"],
  recommended: ["dimensions", "weight", "manufacturer"],
};

// ── Main Analysis ────────────────────────────────────────────────────

/**
 * Analyze a product detail page for listing completeness.
 * Returns a scored result with per-field presence/absence.
 */
export function analyzeListingCompleteness(
  doc: Document,
  departmentId: string | null,
): ListingCompleteness {
  const expectations = departmentId
    ? CATEGORY_EXPECTATIONS[departmentId] ?? DEFAULT_EXPECTATIONS
    : DEFAULT_EXPECTATIONS;

  const requiredSet = new Set(expectations.required);
  const recommendedSet = new Set(expectations.recommended);

  const fields: ListingField[] = FIELD_DETECTORS.map((fd) => {
    const present = fd.detect(doc);
    let importance: ListingField["importance"] = "optional";
    if (requiredSet.has(fd.id)) importance = "required";
    else if (recommendedSet.has(fd.id)) importance = "recommended";

    return { id: fd.id, label: fd.label, present, importance };
  });

  // Scoring: required fields worth 10pts each, recommended 5pts, optional 2pts
  let maxScore = 0;
  let earnedScore = 0;

  for (const field of fields) {
    const pts = field.importance === "required" ? 10
      : field.importance === "recommended" ? 5
      : 2;
    maxScore += pts;
    if (field.present) earnedScore += pts;
  }

  const score = maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 0;

  const presentCount = fields.filter((f) => f.present).length;
  const missingImportantCount = fields.filter(
    (f) => !f.present && (f.importance === "required" || f.importance === "recommended"),
  ).length;

  let label: ListingCompleteness["label"];
  let color: ListingCompleteness["color"];
  if (score >= 80) { label = "complete"; color = "green"; }
  else if (score >= 55) { label = "good"; color = "gray"; }
  else if (score >= 30) { label = "sparse"; color = "orange"; }
  else { label = "poor"; color = "red"; }

  return {
    score,
    label,
    color,
    fields,
    department: departmentId,
    presentCount,
    totalCount: fields.length,
    missingImportantCount,
  };
}
