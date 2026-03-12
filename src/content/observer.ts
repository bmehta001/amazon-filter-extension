import { extractProduct, getProductCards } from "./extractor";
import { applyFilters, applyFilterResult, markTrusted } from "./filters";
import type { FilterState, Product } from "../types";
import { isAllowlisted } from "../brand/allowlist";
import { debounce } from "../util/debounce";

/** Set of already-processed card elements to avoid duplicate work. */
const processedCards = new WeakSet<HTMLElement>();

/** The MutationObserver instance. */
let observer: MutationObserver | null = null;

/**
 * Module-level filter state reference.
 * Always holds the latest filters — updated via updateObserverFilters().
 */
let currentFilterState: FilterState | null = null;

/** Debounced handler for processing new cards (created once). */
const processNewCardsDebounced = debounce(() => {
  if (currentFilterState) {
    processNewCards(currentFilterState);
  }
}, 150);

/**
 * Start observing the DOM for new product cards.
 * When new cards are detected, they are extracted and filtered.
 */
export function startObserving(filterState: FilterState): void {
  if (observer) return; // Already observing

  currentFilterState = filterState;

  observer = new MutationObserver((mutations) => {
    // Only act if childList mutations were detected
    const hasNewNodes = mutations.some(
      (m) => m.type === "childList" && m.addedNodes.length > 0,
    );
    if (hasNewNodes) {
      processNewCardsDebounced();
    }
  });

  // Observe the main content area or body
  const target =
    document.querySelector("#search") ||
    document.querySelector('[data-component-type="s-search-results"]') ||
    document.body;

  observer.observe(target, {
    childList: true,
    subtree: true,
  });
}

/**
 * Stop observing the DOM.
 */
export function stopObserving(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

/**
 * Update the filter state used by the observer.
 * Re-processes all cards with the new state.
 */
export async function refilterAll(filterState: FilterState): Promise<void> {
  const cards = getProductCards();
  for (const card of cards) {
    const product = extractProduct(card);
    const result = await applyFilters(product, filterState);
    applyFilterResult(card, result);
    if (isAllowlisted(product.brand)) {
      markTrusted(card);
    }
  }
}

/**
 * Process only newly added product cards.
 */
async function processNewCards(filterState: FilterState): Promise<void> {
  const cards = getProductCards();
  const newProducts: Product[] = [];

  for (const card of cards) {
    if (!processedCards.has(card)) {
      processedCards.add(card);
      newProducts.push(extractProduct(card));
    }
  }

  for (const product of newProducts) {
    const result = await applyFilters(product, filterState);
    applyFilterResult(product.element, result);
    if (isAllowlisted(product.brand)) {
      markTrusted(product.element);
    }
  }
}

/**
 * Update the filter state reference for the observer.
 * Simply updates the module-level reference — no debounce recreation needed.
 */
export function updateObserverFilters(filterState: FilterState): void {
  currentFilterState = filterState;
}
