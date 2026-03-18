/**
 * Multi-Search Live Test
 *
 * Searches Amazon for several terms (popular and niche), scrolls through
 * multiple pages, and validates that our extraction selectors work on live HTML.
 *
 * Usage:
 *   npx tsx scripts/multi-search-test.ts
 *   npx tsx scripts/multi-search-test.ts --headed
 */

import { chromium, type Page, type Browser } from "playwright";

// ── Config ─────────────────────────────────────────────────────────────

const SEARCH_TERMS = [
  "wireless headphones",        // popular electronics
  "cast iron skillet",           // popular kitchen
  "organic dog treats",          // popular pet
  "mechanical keyboard 75%",    // niche tech
  "arduino temperature sensor",  // niche hobby
  "vintage vinyl record player", // less common
];

const PAGES_PER_TERM = 2;

const HEADED = process.argv.includes("--headed");

// ── Selectors (mirrors our extension) ──────────────────────────────────

const SEL = {
  productCard: 'div[data-component-type="s-search-result"]',
  title: "h2 a span, h2 span.a-text-normal",
  price: "span.a-price span.a-offscreen",
  priceWhole: "span.a-price-whole",
  rating: 'i[class*="a-icon-star"] span.a-icon-alt, a[aria-label*="out of 5 stars"], span[aria-label*="star"]',
  reviewCount: 'a[href*="customerReviews"], span.s-underline-text',
  brandByLink: 'a[href*="/s?"], a[href*="field-brandtextbin"]',
  brandH5: "h5.s-line-clamp-1 > span",
  brandBaseRow: "div.a-row.a-size-base > span.a-size-base-plus.a-color-base",
  sponsored: 'span[data-component-type="s-ads-metrics"], [data-component-type="sp-sponsored-result"]',
  sponsoredText: "span.a-color-secondary, span.puis-label-popover-default",
  // Deal selectors
  coupon: '[data-component-type="s-coupon-component"]',
  dealBadge: '[class*="dealBadge"], [data-deal-badge], span.a-badge-text',
  strikethrough: '[data-strikethroughprice], span.a-text-strike',
  listPrice: 'span.a-text-price span.a-offscreen',
  // Sidebar
  sidebarBrand: '#brandsRefinements, #p_89-title',
  carousel: 'div[class*="_c2Itd_"]',
  // Pagination
  nextPage: 'a.s-pagination-next',
};

interface CardResult {
  asin: string;
  hasTitle: boolean;
  hasPrice: boolean;
  hasRating: boolean;
  hasReviewCount: boolean;
  hasBrand: boolean;
  brandSource: string;
  isSponsored: boolean;
  hasCoupon: boolean;
  hasDealBadge: boolean;
  hasStrikethrough: boolean;
  hasListPrice: boolean;
}

interface SearchResult {
  term: string;
  page: number;
  totalCards: number;
  cards: CardResult[];
  hasSidebarBrands: boolean;
  hasCarousel: boolean;
  hasNextPage: boolean;
  captchaDetected: boolean;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Multi-Search Live Test");
  console.log(`   Terms: ${SEARCH_TERMS.length}`);
  console.log(`   Pages per term: ${PAGES_PER_TERM}`);
  console.log(`   Headed: ${HEADED}\n`);

  const browser = await chromium.launch({
    headless: !HEADED,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });

  const page = await context.newPage();

  // Navigate to Amazon first to set cookies
  console.log("📡 Navigating to Amazon homepage...");
  await page.goto("https://www.amazon.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check for CAPTCHA
  if (await detectCaptcha(page)) {
    console.log("⚠️  CAPTCHA detected on homepage. Waiting 15s for manual solve...");
    await page.waitForTimeout(15000);
  }

  const allResults: SearchResult[] = [];

  for (const term of SEARCH_TERMS) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`🔎 Searching: "${term}"`);
    console.log("═".repeat(60));

    for (let pageNum = 1; pageNum <= PAGES_PER_TERM; pageNum++) {
      const result = await searchAndAnalyze(page, term, pageNum);
      allResults.push(result);

      if (result.captchaDetected) {
        console.log(`   ⚠️  CAPTCHA on page ${pageNum}, waiting 15s...`);
        await page.waitForTimeout(15000);
        // Retry once
        const retry = await searchAndAnalyze(page, term, pageNum);
        allResults[allResults.length - 1] = retry;
      }

      printPageSummary(result);

      // Navigate to next page if available
      if (pageNum < PAGES_PER_TERM && result.hasNextPage) {
        try {
          await page.click(SEL.nextPage, { timeout: 5000 });
          await page.waitForTimeout(2000 + Math.random() * 2000);
        } catch {
          console.log(`   ⚠️  No next page button found, stopping pagination`);
          break;
        }
      }

      // Random delay between pages
      await page.waitForTimeout(1500 + Math.random() * 2000);
    }

    // Delay between search terms
    await page.waitForTimeout(2000 + Math.random() * 3000);
  }

  await browser.close();

  // Print summary
  printOverallSummary(allResults);
}

// ── Search and Analyze ─────────────────────────────────────────────────

async function searchAndAnalyze(
  page: Page,
  term: string,
  pageNum: number,
): Promise<SearchResult> {
  // For first page, do a search; for subsequent pages, we already navigated
  if (pageNum === 1) {
    // Generate realistic metadata
    const crid = randomHex(20).toUpperCase();
    const sprefix = encodeURIComponent(term.slice(0, 6)) + "%2Caps%2C" + (150 + Math.floor(Math.random() * 50));
    const url = `https://www.amazon.com/s?k=${encodeURIComponent(term)}&crid=${crid}&sprefix=${sprefix}&ref=nb_sb_noss_2`;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000 + Math.random() * 1000);

    // Scroll down to trigger lazy loading
    await autoScroll(page);
  }

  const captchaDetected = await detectCaptcha(page);

  // Analyze the page
  const result = await page.evaluate((sel) => {
    const cards = document.querySelectorAll<HTMLElement>(sel.productCard);
    const cardResults: CardResult[] = [];

    for (const card of cards) {
      const asin = card.dataset.asin || "";
      if (!asin) continue; // Skip non-product cards

      // Title
      const titleEl = card.querySelector(sel.title);
      const hasTitle = !!titleEl?.textContent?.trim();

      // Price
      const priceEl = card.querySelector(sel.price) || card.querySelector(sel.priceWhole);
      const hasPrice = !!priceEl?.textContent?.trim();

      // Rating
      const ratingEl = card.querySelector(sel.rating);
      const hasRating = !!ratingEl;

      // Review count
      const reviewEl = card.querySelector(sel.reviewCount);
      const hasReviewCount = !!reviewEl?.textContent?.trim();

      // Brand — try multiple strategies
      let hasBrand = false;
      let brandSource = "none";
      const brandLink = card.querySelector(sel.brandByLink);
      if (brandLink?.textContent?.trim()) {
        hasBrand = true;
        brandSource = "link";
      }
      if (!hasBrand) {
        const h5 = card.querySelector(sel.brandH5);
        if (h5?.textContent?.trim()) {
          hasBrand = true;
          brandSource = "h5";
        }
      }
      if (!hasBrand) {
        const baseRow = card.querySelector(sel.brandBaseRow);
        if (baseRow?.textContent?.trim()) {
          hasBrand = true;
          brandSource = "baseRow";
        }
      }
      if (!hasBrand) {
        // Try URL slug
        const link = card.querySelector<HTMLAnchorElement>("h2 a[href]");
        if (link?.href) {
          const slugMatch = link.href.match(/\/([A-Za-z0-9][\w-]+)\/dp\//);
          if (slugMatch) {
            hasBrand = true;
            brandSource = "urlSlug";
          }
        }
      }
      if (!hasBrand) {
        // Title first word fallback
        if (hasTitle) {
          brandSource = "titleFallback";
          hasBrand = true;
        }
      }

      // Sponsored
      const sponsoredEl = card.querySelector(sel.sponsored);
      let isSponsored = !!sponsoredEl;
      if (!isSponsored) {
        const textEls = card.querySelectorAll(sel.sponsoredText);
        for (const el of textEls) {
          const t = el.textContent?.trim().toLowerCase() || "";
          if (t === "sponsored" || t === "ad") {
            isSponsored = true;
            break;
          }
        }
      }

      // Deal signals
      const hasCoupon = !!card.querySelector(sel.coupon);
      const dealBadgeEl = card.querySelector(sel.dealBadge);
      const hasDealBadge = !!dealBadgeEl && (
        dealBadgeEl.textContent?.toLowerCase().includes("deal") ||
        dealBadgeEl.closest("[data-deal-badge]") !== null ||
        dealBadgeEl.className.includes("dealBadge")
      );
      const hasStrikethrough = !!card.querySelector(sel.strikethrough);
      const hasListPrice = !!card.querySelector(sel.listPrice);

      cardResults.push({
        asin,
        hasTitle,
        hasPrice,
        hasRating,
        hasReviewCount,
        hasBrand,
        brandSource,
        isSponsored,
        hasCoupon,
        hasDealBadge,
        hasStrikethrough,
        hasListPrice,
      });
    }

    const hasSidebarBrands = !!document.querySelector(sel.sidebarBrand);
    const hasCarousel = !!document.querySelector(sel.carousel);
    const hasNextPage = !!document.querySelector(sel.nextPage);

    return {
      totalCards: cardResults.length,
      cards: cardResults,
      hasSidebarBrands,
      hasCarousel,
      hasNextPage,
    };
  }, SEL);

  return {
    term,
    page: pageNum,
    captchaDetected,
    ...result,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

async function detectCaptcha(page: Page): Promise<boolean> {
  const text = await page.textContent("body").catch(() => "");
  return (
    text?.includes("Enter the characters you see below") === true ||
    text?.includes("Sorry, we just need to make sure") === true ||
    text?.includes("Click the button to continue shopping") === true ||
    text?.includes("Type the characters you see in this image") === true
  );
}

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
      // Safety timeout
      setTimeout(() => { clearInterval(timer); resolve(); }, 8000);
    });
  });
  await page.waitForTimeout(1000);
}

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ── Output ─────────────────────────────────────────────────────────────

function printPageSummary(r: SearchResult): void {
  const total = r.cards.length;
  if (total === 0) {
    console.log(`   Page ${r.page}: ⚠️  No product cards found ${r.captchaDetected ? "(CAPTCHA)" : ""}`);
    return;
  }

  const withTitle = r.cards.filter((c) => c.hasTitle).length;
  const withPrice = r.cards.filter((c) => c.hasPrice).length;
  const withRating = r.cards.filter((c) => c.hasRating).length;
  const withReviews = r.cards.filter((c) => c.hasReviewCount).length;
  const withBrand = r.cards.filter((c) => c.hasBrand).length;
  const sponsored = r.cards.filter((c) => c.isSponsored).length;
  const withCoupon = r.cards.filter((c) => c.hasCoupon).length;
  const withDealBadge = r.cards.filter((c) => c.hasDealBadge).length;
  const withStrikethrough = r.cards.filter((c) => c.hasStrikethrough).length;

  // Brand source breakdown
  const brandSources: Record<string, number> = {};
  for (const c of r.cards) {
    brandSources[c.brandSource] = (brandSources[c.brandSource] || 0) + 1;
  }

  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

  console.log(`   Page ${r.page}: ${total} cards`);
  console.log(`     Title:  ${withTitle}/${total} (${pct(withTitle)})  |  Price: ${withPrice}/${total} (${pct(withPrice)})`);
  console.log(`     Rating: ${withRating}/${total} (${pct(withRating)})  |  Reviews: ${withReviews}/${total} (${pct(withReviews)})`);
  console.log(`     Brand:  ${withBrand}/${total} (${pct(withBrand)})  — sources: ${JSON.stringify(brandSources)}`);
  console.log(`     Sponsored: ${sponsored}  |  Coupons: ${withCoupon}  |  Deal badges: ${withDealBadge}  |  Strikethrough: ${withStrikethrough}`);
  if (r.hasSidebarBrands) console.log(`     ✅ Sidebar brand filter found`);
  if (r.hasCarousel) console.log(`     📦 Sponsored carousel detected`);
  if (r.hasNextPage) console.log(`     ➡️  Next page available`);
}

function printOverallSummary(results: SearchResult[]): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log("📊 OVERALL SUMMARY");
  console.log("═".repeat(60));

  let totalCards = 0;
  let totalTitle = 0;
  let totalPrice = 0;
  let totalRating = 0;
  let totalReviews = 0;
  let totalBrand = 0;
  let totalSponsored = 0;
  let totalCoupons = 0;
  let totalDeals = 0;
  let totalStrikethrough = 0;
  let captchaCount = 0;
  const allBrandSources: Record<string, number> = {};

  for (const r of results) {
    if (r.captchaDetected) captchaCount++;
    for (const c of r.cards) {
      totalCards++;
      if (c.hasTitle) totalTitle++;
      if (c.hasPrice) totalPrice++;
      if (c.hasRating) totalRating++;
      if (c.hasReviewCount) totalReviews++;
      if (c.hasBrand) totalBrand++;
      if (c.isSponsored) totalSponsored++;
      if (c.hasCoupon) totalCoupons++;
      if (c.hasDealBadge) totalDeals++;
      if (c.hasStrikethrough) totalStrikethrough++;
      allBrandSources[c.brandSource] = (allBrandSources[c.brandSource] || 0) + 1;
    }
  }

  const pct = (n: number) => totalCards > 0 ? `${Math.round((n / totalCards) * 100)}%` : "N/A";

  console.log(`\n   Total cards analyzed: ${totalCards} across ${results.length} pages`);
  console.log(`   CAPTCHAs encountered: ${captchaCount}`);
  console.log(`\n   Extraction rates:`);
  console.log(`     Title:     ${totalTitle}/${totalCards} (${pct(totalTitle)})`);
  console.log(`     Price:     ${totalPrice}/${totalCards} (${pct(totalPrice)})`);
  console.log(`     Rating:    ${totalRating}/${totalCards} (${pct(totalRating)})`);
  console.log(`     Reviews:   ${totalReviews}/${totalCards} (${pct(totalReviews)})`);
  console.log(`     Brand:     ${totalBrand}/${totalCards} (${pct(totalBrand)})`);
  console.log(`\n   Brand sources: ${JSON.stringify(allBrandSources, null, 2)}`);
  console.log(`\n   Deal signals:`);
  console.log(`     Sponsored: ${totalSponsored} (${pct(totalSponsored)})`);
  console.log(`     Coupons:   ${totalCoupons} (${pct(totalCoupons)})`);
  console.log(`     Deal badges: ${totalDeals}`);
  console.log(`     Strikethrough price: ${totalStrikethrough}`);

  // Pass/fail assessment
  console.log(`\n   ──── Assessment ────`);
  const titleRate = totalCards > 0 ? totalTitle / totalCards : 0;
  const priceRate = totalCards > 0 ? totalPrice / totalCards : 0;
  const brandRate = totalCards > 0 ? totalBrand / totalCards : 0;

  if (totalCards === 0) {
    console.log("   ❌ FAIL: No cards found — likely all CAPTCHAs");
  } else {
    console.log(`   ${titleRate >= 0.9 ? "✅" : "⚠️"}  Title extraction: ${pct(totalTitle)}`);
    console.log(`   ${priceRate >= 0.7 ? "✅" : "⚠️"}  Price extraction: ${pct(totalPrice)}`);
    console.log(`   ${brandRate >= 0.8 ? "✅" : "⚠️"}  Brand extraction: ${pct(totalBrand)}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
