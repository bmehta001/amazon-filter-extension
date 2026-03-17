/**
 * Self-improving generic word system.
 *
 * When the brand fetcher resolves a brand from a product detail page, this
 * module compares the result against what slug/title extraction found:
 *
 * - If the detail page returns the SAME word that slug/title had but was
 *   blocked by GENERIC_WORDS → that word is actually a brand → add to
 *   learnedBrands so future extractions accept it immediately.
 *
 * - If the detail page returns a DIFFERENT word → the slug/title word was
 *   indeed generic → confirmed (no action needed, it's already in the list).
 *
 * Learned brand words are stored in chrome.storage.local and loaded at startup.
 */

const STORAGE_KEY = "bas_learned_brands";

/** In-memory set of words learned to be real brands despite appearing generic. */
let learnedBrands = new Set<string>();

/** Whether the learned brands have been loaded from storage. */
let loaded = false;

/**
 * Load learned brand words from persistent storage.
 * Call once at startup before brand extraction begins.
 */
export async function loadLearnedBrands(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        console.warn("[BAS] Failed to load learned brands:", chrome.runtime.lastError.message);
        loaded = true;
        resolve();
        return;
      }

      const stored = result[STORAGE_KEY] as string[] | undefined;
      if (stored && Array.isArray(stored)) {
        learnedBrands = new Set(stored.map((w) => w.toLowerCase()));
      }
      loaded = true;
      resolve();
    });
  });
}

/**
 * Check if a word has been learned as a real brand.
 */
export function isLearnedBrand(word: string): boolean {
  return learnedBrands.has(word.toLowerCase());
}

/**
 * Record a brand learning event.
 *
 * @param slugOrTitleWord - The word extracted from URL slug or title (that was
 *   blocked by GENERIC_WORDS). May be null if no candidate was found.
 * @param confirmedBrand - The definitive brand from the product detail page.
 */
export async function recordBrandLearning(
  slugOrTitleWord: string | null,
  confirmedBrand: string,
): Promise<void> {
  if (!slugOrTitleWord) return;

  const candidate = slugOrTitleWord.toLowerCase();
  const confirmed = confirmedBrand.toLowerCase();

  // If the detail page returned the same word, it's a real brand
  if (candidate === confirmed && !learnedBrands.has(candidate)) {
    learnedBrands.add(candidate);
    await persistLearnedBrands();
  }
  // If different, the candidate is confirmed generic — no action needed
}

/**
 * Get the current set of learned brand words (for testing/debugging).
 */
export function getLearnedBrands(): ReadonlySet<string> {
  return learnedBrands;
}

/**
 * Clear all learned brands (for testing).
 */
export async function clearLearnedBrands(): Promise<void> {
  learnedBrands.clear();
  return new Promise((resolve) => {
    chrome.storage.local.remove(STORAGE_KEY, () => resolve());
  });
}

async function persistLearnedBrands(): Promise<void> {
  const words = Array.from(learnedBrands);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: words }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[BAS] Failed to save learned brands:", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}
