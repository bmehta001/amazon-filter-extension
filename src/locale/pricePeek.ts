/**
 * Multi-Locale Price Peek — checks whether the same ASIN is available
 * at a different price on other Amazon locales.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface LocalePrice {
  locale: string;
  localPrice: number;
  currency: string;
  currencySymbol: string;
  usdEquivalent: number;
  available: boolean;
}

export interface LocalePriceComparison {
  currentLocale: string;
  currentPrice: number;
  alternatives: LocalePrice[];
  cheapest: LocalePrice | null;
  savingsUsd: number;
}

// ── Locale Configuration ─────────────────────────────────────────────

export interface LocaleConfig {
  domain: string;
  currency: string;
  symbol: string;
  usdRate: number;
}

const LOCALES: LocaleConfig[] = [
  { domain: "www.amazon.com", currency: "USD", symbol: "$", usdRate: 1.0 },
  { domain: "www.amazon.co.uk", currency: "GBP", symbol: "£", usdRate: 1.27 },
  { domain: "www.amazon.ca", currency: "CAD", symbol: "CA$", usdRate: 0.74 },
  { domain: "www.amazon.de", currency: "EUR", symbol: "€", usdRate: 1.09 },
  { domain: "www.amazon.co.jp", currency: "JPY", symbol: "¥", usdRate: 0.0067 },
  { domain: "www.amazon.com.au", currency: "AUD", symbol: "A$", usdRate: 0.65 },
  { domain: "www.amazon.in", currency: "INR", symbol: "₹", usdRate: 0.012 },
];

export function getLocalesToCheck(currentDomain: string, maxLocales = 3): LocaleConfig[] {
  const priority = ["www.amazon.com", "www.amazon.co.uk", "www.amazon.ca", "www.amazon.de", "www.amazon.com.au"];
  return priority
    .filter((d) => d !== currentDomain)
    .slice(0, maxLocales)
    .map((d) => LOCALES.find((l) => l.domain === d)!)
    .filter(Boolean);
}

// ── Price Extraction ─────────────────────────────────────────────────

export function extractPriceFromLocale(html: string, locale: LocaleConfig): number | null {
  const offscreenMatch = html.match(/class="a-offscreen">\s*[^\d]*([\d.,]+)/);
  if (offscreenMatch) return parseLocalPrice(offscreenMatch[1], locale.currency);

  const jsonMatch = html.match(/"priceAmount":\s*([\d.]+)/);
  if (jsonMatch) return parseFloat(jsonMatch[1]);

  const wholeMatch = html.match(/a-price-whole[^>]*>([\d.,]+)/);
  const fractionMatch = html.match(/a-price-fraction[^>]*>(\d+)/);
  if (wholeMatch) {
    const whole = parseLocalPrice(wholeMatch[1], locale.currency);
    const fraction = fractionMatch ? parseInt(fractionMatch[1], 10) : 0;
    return whole !== null ? whole + fraction / 100 : null;
  }

  return null;
}

function parseLocalPrice(priceStr: string, currency: string): number | null {
  let cleaned = priceStr.replace(/\s/g, "");
  if (currency === "EUR" && cleaned.includes(",") && cleaned.indexOf(",") > cleaned.lastIndexOf(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  if (currency === "INR" || currency === "JPY") {
    cleaned = cleaned.replace(/,/g, "");
  }
  cleaned = cleaned.replace(/,/g, "");
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

// ── Comparison Builder ───────────────────────────────────────────────

export function buildComparison(
  currentDomain: string,
  currentPrice: number,
  localePrices: LocalePrice[],
): LocalePriceComparison {
  const currentLocale = LOCALES.find((l) => l.domain === currentDomain);
  const currentUsd = currentLocale ? currentPrice * currentLocale.usdRate : currentPrice;

  const available = localePrices.filter((lp) => lp.available);
  const cheapest = available.length > 0
    ? available.reduce((min, lp) => lp.usdEquivalent < min.usdEquivalent ? lp : min)
    : null;

  return {
    currentLocale: currentDomain,
    currentPrice,
    alternatives: available,
    cheapest,
    savingsUsd: cheapest ? Math.max(0, Math.round((currentUsd - cheapest.usdEquivalent) * 100) / 100) : 0,
  };
}

export function toLocalePrice(config: LocaleConfig, localPrice: number | null): LocalePrice {
  if (localPrice === null) {
    return { locale: config.domain, localPrice: 0, currency: config.currency, currencySymbol: config.symbol, usdEquivalent: 0, available: false };
  }
  return {
    locale: config.domain,
    localPrice,
    currency: config.currency,
    currencySymbol: config.symbol,
    usdEquivalent: Math.round(localPrice * config.usdRate * 100) / 100,
    available: true,
  };
}

export function formatLocalePrice(lp: LocalePrice): string {
  if (!lp.available) return `Not available on ${lp.locale.replace("www.", "")}`;
  return `${lp.currencySymbol}${lp.localPrice.toFixed(2)} (~$${lp.usdEquivalent.toFixed(2)}) on ${lp.locale.replace("www.", "")}`;
}
