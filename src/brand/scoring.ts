/**
 * Suspicious brand name scoring heuristics.
 *
 * Returns a score from 0 (legitimate-looking) to 1 (likely gibberish).
 * A score >= 0.5 is considered "suspicious."
 */

/** Compute a suspiciousness score for a brand name. */
export function suspiciousScore(name: string): number {
  if (!name || name.trim().length === 0) return 1; // empty = suspicious

  const trimmed = name.trim();
  let score = 0;

  score += vowelRatioScore(trimmed);
  score += randomCapsScore(trimmed);
  score += nonAsciiScore(trimmed);
  score += specialCharScore(trimmed);
  score += shortConsonantScore(trimmed);

  return Math.min(score, 1);
}

/** Threshold above which a brand is considered suspicious. */
export const SUSPICIOUS_THRESHOLD = 0.5;

/** Check if a brand name is suspicious. */
export function isSuspicious(name: string): boolean {
  return suspiciousScore(name) >= SUSPICIOUS_THRESHOLD;
}

// ── Heuristic sub-scores ─────────────────────────────────────────────

/**
 * Low vowel ratio → suspicious.
 * Real English words typically have 35-45% vowels.
 * Brand names like "QXZTK" have ~0%.
 */
function vowelRatioScore(name: string): number {
  const letters = name.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return 0.2;
  const vowels = letters.replace(/[^aeiouAEIOU]/g, "").length;
  const ratio = vowels / letters.length;
  if (ratio < 0.1) return 0.4;
  if (ratio < 0.2) return 0.3;
  if (ratio < 0.3) return 0.15;
  return 0;
}

/**
 * Random capitalization patterns → suspicious.
 * E.g. "aXbYcZ" or "hJKLmN" — not standard title case or ALL CAPS.
 */
function randomCapsScore(name: string): number {
  const letters = name.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 3) return 0;

  // All caps or all lower is fine (brand convention)
  if (letters === letters.toUpperCase() || letters === letters.toLowerCase()) {
    return 0;
  }

  // Title case is fine: "Samsung", "Under Armour"
  const words = name.trim().split(/\s+/);
  const isTitleCase = words.every(
    (w) =>
      w.length === 0 ||
      w === w.toUpperCase() ||
      (w[0] === w[0].toUpperCase() && w.slice(1) === w.slice(1).toLowerCase()),
  );
  if (isTitleCase) return 0;

  // Count case transitions (upper→lower or lower→upper)
  let transitions = 0;
  for (let i = 1; i < letters.length; i++) {
    const prevUpper = letters[i - 1] === letters[i - 1].toUpperCase();
    const currUpper = letters[i] === letters[i].toUpperCase();
    if (prevUpper !== currUpper) transitions++;
  }
  const transitionRate = transitions / (letters.length - 1);
  if (transitionRate > 0.6) return 0.2;
  return 0;
}

/**
 * High non-ASCII character ratio → suspicious.
 * Catches encoding issues and unusual character usage.
 */
function nonAsciiScore(name: string): number {
  const ascii = name.replace(/[^\x20-\x7E]/g, "").length;
  if (name.length === 0) return 0;
  const ratio = ascii / name.length;
  if (ratio < 0.5) return 0.3;
  return 0;
}

/**
 * High special character ratio → suspicious.
 * Real brands: 5-10% special chars. Gibberish: 40%+.
 */
function specialCharScore(name: string): number {
  const specials = name.replace(/[a-zA-Z0-9\s]/g, "").length;
  if (name.length === 0) return 0;
  const ratio = specials / name.length;
  if (ratio > 0.4) return 0.3;
  if (ratio > 0.25) return 0.1;
  return 0;
}

/**
 * Very short all-consonant names → suspicious.
 * E.g. "BGHT", "XKCD" (well, that one's legit, but rare).
 */
function shortConsonantScore(name: string): number {
  const letters = name.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0 || letters.length > 6) return 0;
  const vowels = letters.replace(/[^aeiouAEIOU]/g, "").length;
  if (vowels === 0) return 0.3;
  return 0;
}
