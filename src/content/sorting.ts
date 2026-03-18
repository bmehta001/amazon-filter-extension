import type { Product, SortCriteria } from "../types";

export type { SortCriteria };

interface SortableProduct {
  product: Product;
  originalIndex: number;
}

// Store original DOM order for reset
let originalOrder: WeakMap<HTMLElement, number> = new WeakMap();
let orderInitialized = false;

/**
 * Initialize original order tracking. Call once before any sort.
 */
export function initOriginalOrder(products: Product[]): void {
  if (orderInitialized) return;
  products.forEach((p, i) => originalOrder.set(p.element, i));
  orderInitialized = true;
}

/**
 * Reset original order tracking (e.g., on soft navigation).
 */
export function resetOriginalOrder(): void {
  originalOrder = new WeakMap();
  orderInitialized = false;
}

/**
 * Sort product cards in the DOM by the given criteria.
 * Returns the count of products sorted.
 */
export function sortProducts(products: Product[], criteria: SortCriteria, dealScores?: Map<string, number>): number {
  if (!products.length) return 0;
  
  // Initialize original order on first sort
  initOriginalOrder(products);
  
  const sortable: SortableProduct[] = products.map((p, i) => ({
    product: p,
    originalIndex: originalOrder.get(p.element) ?? i,
  }));

  // Sort based on criteria
  sortable.sort((a, b) => {
    switch (criteria) {
      case "reviews":
        return b.product.reviewCount - a.product.reviewCount;
      
      case "value": {
        // Value = (rating * reviewCount) / price — higher is better
        const valA = computeValueScore(a.product);
        const valB = computeValueScore(b.product);
        return valB - valA;
      }
      
      case "trending": {
        // Approximate trending: high review count + high rating as proxy
        // Products with many reviews and high ratings are likely trending
        const trendA = computeTrendScore(a.product);
        const trendB = computeTrendScore(b.product);
        return trendB - trendA;
      }
      
      case "deal-score": {
        const scoreA = dealScores?.get(a.product.asin ?? "") ?? 0;
        const scoreB = dealScores?.get(b.product.asin ?? "") ?? 0;
        return scoreB - scoreA;
      }
      
      case "price-low": {
        const priceA = a.product.price ?? Infinity;
        const priceB = b.product.price ?? Infinity;
        return priceA - priceB;
      }
      
      case "price-high": {
        const priceA = a.product.price ?? -Infinity;
        const priceB = b.product.price ?? -Infinity;
        return priceB - priceA;
      }
      
      case "default":
      default:
        return a.originalIndex - b.originalIndex;
    }
  });

  // Reorder DOM elements
  reorderElements(sortable.map(s => s.product.element));
  
  return sortable.length;
}

/**
 * Compute a "value" score: bang for your buck.
 * Higher rating and more reviews at a lower price = better value.
 */
export function computeValueScore(product: Product): number {
  const price = product.price ?? 0;
  if (price <= 0) return 0;
  const rating = product.rating || 0;
  const reviews = product.reviewCount || 0;
  // Logarithmic review count to avoid mega-sellers dominating
  return (rating * Math.log10(reviews + 1)) / price;
}

/**
 * Compute a "trending" score.
 * High review counts with high ratings suggest popular/trending products.
 */
export function computeTrendScore(product: Product): number {
  const rating = product.rating || 0;
  const reviews = product.reviewCount || 0;
  // Weight recent popularity: sqrt of reviews * rating^2
  return Math.sqrt(reviews) * (rating * rating);
}

/**
 * Reorder DOM elements within their common parent.
 */
function reorderElements(elements: HTMLElement[]): void {
  if (!elements.length) return;
  
  // Find the common parent
  const parent = elements[0].parentElement;
  if (!parent) return;
  
  // Collect non-product children (ads, separators, etc.) and their positions
  const allChildren = Array.from(parent.children);
  const productSet = new Set(elements);
  const nonProducts: { element: Element; insertBeforeIndex: number }[] = [];
  
  let productIdx = 0;
  for (let i = 0; i < allChildren.length; i++) {
    if (!productSet.has(allChildren[i] as HTMLElement)) {
      nonProducts.push({ element: allChildren[i], insertBeforeIndex: productIdx });
    } else {
      productIdx++;
    }
  }
  
  // Reorder: move sorted product elements in order
  for (const el of elements) {
    parent.appendChild(el);
  }
  
  // Reinsert non-product elements at their relative positions
  for (const np of nonProducts) {
    const refChild = elements[np.insertBeforeIndex];
    if (refChild) {
      parent.insertBefore(np.element, refChild);
    }
  }
}
