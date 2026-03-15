/**
 * Product card extraction for Amazon Haul pages.
 *
 * Amazon Haul is a React SPA with completely different DOM structure from
 * regular search results. Product cards on Haul don't show star ratings or
 * review counts — only price, title, image, and badges like "Selling fast".
 *
 * This extractor uses multiple strategies to find product cards since the
 * Haul DOM may change without notice:
 *   1. Link-based: find <a> tags linking to /dp/ product pages
 *   2. Data-attribute: look for elements with ASIN or product-type data attrs
 *   3. Grid-child: find card-like containers in grid layouts with images + prices
 */

import type { Product } from "../types";
import { extractAsin, parsePrice } from "../util/parse";

// ── Haul-specific selectors ─────────────────────────────────────────

/**
 * CSS selectors attempted in order to find individual product cards.
 * We try specific Haul patterns first, then fall back to generic ones.
 */
const HAUL_CARD_SELECTORS = [
  // Haul uses a product grid with cards that link to /dp/ pages
  '[data-testid*="product-card"]',
  '[data-component-type*="product"]',
  '[class*="product-card"]',
  '[class*="ProductCard"]',
  '[class*="product_card"]',
  // Haul's grid items
  '[data-testid*="grid-item"]',
  '[class*="grid-item"]',
  '[class*="GridItem"]',
] as const;

/**
 * Fallback: find product cards by looking for anchor elements that link
 * to Amazon product pages (/dp/, /gp/product/) and walking up to find
 * their card container.
 */
function findCardsByProductLinks(): HTMLElement[] {
  const links = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/dp/"], a[href*="/gp/product/"]',
  );

  const cardMap = new Map<HTMLElement, boolean>();

  for (const link of links) {
    // Skip nav, header, footer links
    if (link.closest("nav, header, footer, #navbar, #nav-main")) continue;

    // Walk up to find a card-like container (has image + bounded size)
    let candidate = link.parentElement;
    let depth = 0;
    const maxDepth = 6;

    while (candidate && depth < maxDepth) {
      // A card container typically has an image and is a block/grid/flex child
      const hasImage = candidate.querySelector("img") !== null;
      const style = getComputedStyle(candidate);
      const isBlock =
        style.display === "block" ||
        style.display === "flex" ||
        style.display === "grid" ||
        style.display === "inline-block";

      if (hasImage && isBlock && candidate.offsetHeight > 80) {
        // Check that this container isn't too large (not the whole page)
        if (candidate.offsetHeight < 800 && candidate.offsetWidth < 600) {
          // Don't include duplicates
          if (!cardMap.has(candidate)) {
            cardMap.set(candidate, true);
          }
          break;
        }
      }
      candidate = candidate.parentElement;
      depth++;
    }
  }

  return Array.from(cardMap.keys());
}

/**
 * Get all product card elements from a Haul page.
 */
export function getHaulProductCards(): HTMLElement[] {
  // Strategy 1: Try Haul-specific selectors
  for (const selector of HAUL_CARD_SELECTORS) {
    const cards = document.querySelectorAll<HTMLElement>(selector);
    if (cards.length > 0) {
      return Array.from(cards);
    }
  }

  // Strategy 2: Find cards by product links
  const linkCards = findCardsByProductLinks();
  if (linkCards.length > 0) {
    return linkCards;
  }

  return [];
}

/**
 * Extract a Product from a Haul product card element.
 * Handles missing ratings/reviews gracefully (defaults to 0).
 */
export function extractHaulProduct(card: HTMLElement): Product {
  return {
    element: card,
    title: extractHaulTitle(card),
    reviewCount: extractHaulReviewCount(card),
    rating: extractHaulRating(card),
    price: extractHaulPrice(card),
    brand: extractHaulBrand(card),
    isSponsored: detectHaulSponsored(card),
    asin: extractHaulAsin(card),
  };
}

/**
 * Extract all products from a Haul page.
 */
export function extractAllHaulProducts(): Product[] {
  return getHaulProductCards().map(extractHaulProduct);
}

// ── Private Haul extraction helpers ─────────────────────────────────

function extractHaulTitle(card: HTMLElement): string {
  // Try img alt text (Haul cards often use descriptive alt text)
  const img = card.querySelector<HTMLImageElement>("img[alt]");
  if (img?.alt && img.alt.length > 5) {
    return img.alt.trim();
  }

  // Try link text or aria-label
  const link = card.querySelector<HTMLAnchorElement>('a[href*="/dp/"]');
  if (link) {
    const ariaLabel = link.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.length > 5) return ariaLabel.trim();

    // Get text from the link or its children (skip price text)
    const textNodes: string[] = [];
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim();
      if (text && text.length > 2 && !text.startsWith("$") && !/^\d+\.\d{2}$/.test(text)) {
        textNodes.push(text);
      }
    }
    if (textNodes.length > 0) return textNodes.join(" ");
  }

  // Try any heading or prominent text inside the card
  const heading = card.querySelector("h2, h3, h4, [class*='title'], [class*='Title'], [class*='name'], [class*='Name']");
  if (heading?.textContent?.trim()) {
    return heading.textContent.trim();
  }

  // Last resort: first meaningful text content
  const allText = card.textContent?.trim() || "";
  // Take first ~100 chars that aren't just price
  const lines = allText.split("\n").filter((l) => l.trim().length > 3 && !l.trim().startsWith("$"));
  return lines[0]?.trim().substring(0, 120) || "";
}

function extractHaulReviewCount(card: HTMLElement): number {
  // Haul may show review counts in some cases
  const reviewEls = card.querySelectorAll('[aria-label*="review" i], [aria-label*="rating" i]');
  for (const el of reviewEls) {
    const label = el.getAttribute("aria-label") || "";
    const match = label.match(/([\d,.]+)\s*(?:review|rating)/i);
    if (match) {
      return parseInt(match[1].replace(/[,\s]/g, ""), 10) || 0;
    }
  }

  // Look for review count text patterns
  const spans = card.querySelectorAll("span, div");
  for (const span of spans) {
    const text = span.textContent?.trim() || "";
    // Match patterns like "1,234 ratings" or "(456)"
    const match = text.match(/^([\d,.]+)\s*(?:rating|review)/i) || text.match(/^\(([\d,.]+)\)$/);
    if (match) {
      return parseInt(match[1].replace(/[,\s]/g, ""), 10) || 0;
    }
  }

  return 0;
}

function extractHaulRating(card: HTMLElement): number {
  // Try aria-label on star elements
  const starEls = card.querySelectorAll('[aria-label*="star" i], [class*="star" i], [class*="rating" i]');
  for (const el of starEls) {
    const label = el.getAttribute("aria-label") || "";
    const match = label.match(/([\d.]+)\s*(?:out of|\/)\s*5/i) || label.match(/([\d.]+)\s*star/i);
    if (match) {
      return parseFloat(match[1]) || 0;
    }
  }

  return 0;
}

function extractHaulPrice(card: HTMLElement): number | null {
  // Try standard Amazon price elements
  const offscreen = card.querySelector("span.a-price span.a-offscreen");
  if (offscreen?.textContent) {
    return parsePrice(offscreen.textContent);
  }

  // Look for price-like patterns in any element
  const allElements = card.querySelectorAll("span, div, p");
  for (const el of allElements) {
    const text = el.textContent?.trim() || "";
    // Match $X.XX or $X patterns (Haul prices are ≤$20)
    const match = text.match(/^\$(\d+(?:\.\d{1,2})?)$/);
    if (match) {
      return parseFloat(match[1]);
    }
  }

  // Try aria-label containing price
  const priceEls = card.querySelectorAll('[aria-label*="$"]');
  for (const el of priceEls) {
    const label = el.getAttribute("aria-label") || "";
    const match = label.match(/\$(\d+(?:\.\d{1,2})?)/);
    if (match) {
      return parseFloat(match[1]);
    }
  }

  return null;
}

function extractHaulBrand(card: HTMLElement): string {
  // Haul rarely shows brand prominently — try common patterns
  const brandEl = card.querySelector('[class*="brand" i], [class*="Brand" i], [data-testid*="brand"]');
  if (brandEl?.textContent?.trim()) {
    let text = brandEl.textContent.trim();
    // Strip "by " prefix common in Amazon brand displays
    text = text.replace(/^by\s+/i, "").trim();
    if (text.length > 0) return text;
  }

  // Try "by BrandName" pattern in card text
  const cardText = card.textContent || "";
  const byMatch = cardText.match(/\bby\s+([A-Za-z0-9][A-Za-z0-9 &'.+-]{1,30})/);
  if (byMatch) {
    return byMatch[1].trim();
  }

  return "Unknown";
}

function detectHaulSponsored(card: HTMLElement): boolean {
  const cardText = (card.textContent || "").toLowerCase();
  if (/\bsponsored\b/.test(cardText) || /\bad\b/.test(cardText)) {
    return true;
  }

  // Check data attributes
  if (card.dataset.isSponsored === "true" || card.dataset.sponsored === "true") {
    return true;
  }

  // Check aria-labels
  const ariaEls = card.querySelectorAll("[aria-label]");
  for (const el of ariaEls) {
    if (/\bsponsored\b/i.test(el.getAttribute("aria-label") || "")) {
      return true;
    }
  }

  return false;
}

function extractHaulAsin(card: HTMLElement): string | null {
  // Try data attribute on the card
  if (card.dataset.asin) return card.dataset.asin;

  // Extract from product link URL
  const link = card.querySelector<HTMLAnchorElement>('a[href*="/dp/"]');
  if (link?.href) {
    return extractAsin(link.href);
  }

  // Try any link with /gp/product/
  const gpLink = card.querySelector<HTMLAnchorElement>('a[href*="/gp/product/"]');
  if (gpLink?.href) {
    return extractAsin(gpLink.href);
  }

  return null;
}
