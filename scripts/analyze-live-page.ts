/**
 * Live Amazon Page Analyzer
 *
 * Uses Playwright to navigate to Amazon, search a term, wait for full JS
 * rendering, then validate all our selectors against the live DOM.
 *
 * Usage:
 *   npx tsx scripts/analyze-live-page.ts [search-term]
 *   npx tsx scripts/analyze-live-page.ts "wireless headphones"
 *   npx tsx scripts/analyze-live-page.ts --save  (saves rendered HTML to example_pages/)
 *
 * Options:
 *   --save       Save rendered HTML snapshot to example_pages/live-<term>.html
 *   --headed     Show the browser window (default: headless)
 *   --slow       Add slowMo for visual debugging
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// ── Our extension's selectors (mirrored from extractor.ts) ────────────
const SELECTORS = {
  productCard: 'div[data-component-type="s-search-result"]',
  titleText: "h2 a span, h2 span.a-text-normal, h2.a-text-normal > span, h2 > span",
  ratingStarIcon: 'i[class*="a-icon-star"] span.a-icon-alt',
  ratingAriaLabel: 'a[aria-label*="out of 5 stars"]',
  ratingSpanAria: 'span[aria-label*="star"]',
  ratingLegacy: "i.a-icon-star-small span.a-icon-alt",
  ratingMini: "i.a-icon-star-mini span.a-icon-alt",
  price: "span.a-price span.a-offscreen",
  priceWhole: "span.a-price-whole",
  reviewLink: 'a[href*="customerReviews"]',
  reviewUnderlined: "span.s-underline-text",
  brandByLink: 'a[href*="/s?"], a[href*="field-brandtextbin"]',
  brandBrandtextbin: 'a[href*="brandtextbin"]',
  brandAriaLabel: 'a[aria-label*="brand" i]',
  brandBaseRow:
    "div.a-row.a-size-base > span.a-size-base-plus.a-color-base",
  brandH5: "h5.s-line-clamp-1 > span",
  sponsoredAdsMetrics: 'span[data-component-type="s-ads-metrics"]',
  sponsoredResult: '[data-component-type="sp-sponsored-result"]',
  sponsoredAdHolder: "div.AdHolder, div.s-ad-holder",
  sponsoredSecondary:
    "span.a-color-secondary, span.puis-label-popover-default",
  sidebarBrand: "#brandsRefinements, #p_89-title",
  carousel: 'div[class*="_c2Itd_"]',
} as const;

interface CardAnalysis {
  asin: string;
  title: string;
  isSponsored: boolean;
  brand: {
    byLink: string | null;
    visitStore: string | null;
    byPattern: string | null;
    baseRowSpan: string | null;
    h5Span: string | null;
    brandtextbinLink: string | null;
    ariaLabelLink: string | null;
    resolved: string;
  };
  rating: {
    starIconAlt: string | null;
    ariaLabel: string | null;
    spanAriaLabel: string | null;
    legacyStarSmall: string | null;
    miniStar: string | null;
    resolved: number;
  };
  reviewCount: {
    customerReviewsLink: string | null;
    underlinedSpan: string | null;
    ariaRating: string | null;
    resolved: number;
  };
  price: {
    offscreen: string | null;
    whole: string | null;
    resolved: number | null;
  };
}

interface PageAnalysis {
  url: string;
  searchTerm: string;
  timestamp: string;
  totalCards: number;
  sponsoredCards: number;
  selectorCoverage: Record<string, { matches: number; pct: string }>;
  cards: CardAnalysis[];
  sidebarSections: string[];
  carouselCount: number;
}

// ── Parse CLI args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const searchTerms = args.filter((a) => !a.startsWith("--"));
const searchTerm = searchTerms.join(" ") || "wireless headphones";
const shouldSave = flags.has("--save");
const headed = flags.has("--headed");
const slow = flags.has("--slow");

/**
 * Generate a realistic Amazon crid (Correlation Request ID).
 * Format: 12 uppercase alphanumeric chars, e.g. "9R8Y3P5H12QY"
 */
function generateCrid(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let crid = "";
  for (let i = 0; i < 12; i++) {
    crid += chars[Math.floor(Math.random() * chars.length)];
  }
  return crid;
}

/**
 * Handle Amazon's "Continue shopping" interstitial page.
 * Simulates human-like mouse movement before clicking the button.
 */
async function handleContinueShopping(page: any, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Look for "Continue shopping" or similar interstitial buttons
    const buttonSelectors = [
      'input[type="submit"]',
      'button:has-text("Continue")',
      'a:has-text("Continue shopping")',
      'input[value*="Continue"]',
      'button:has-text("Continue shopping")',
      'a.a-button-text:has-text("Continue")',
      'span.a-button-text:has-text("Continue")',
    ];

    let button = null;
    for (const sel of buttonSelectors) {
      const loc = page.locator(sel).first();
      const visible = await loc.isVisible().catch(() => false);
      if (visible) {
        button = loc;
        break;
      }
    }

    if (!button) return; // No interstitial, we're good

    console.log(`   🖱️  Found interstitial button (attempt ${attempt}/${maxAttempts}), clicking...`);

    // Jiggle the mouse around randomly first to look human
    const viewport = page.viewportSize() || { width: 1920, height: 1080 };
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const x = 200 + Math.floor(Math.random() * (viewport.width - 400));
      const y = 200 + Math.floor(Math.random() * (viewport.height - 400));
      await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 10) });
      await page.waitForTimeout(100 + Math.floor(Math.random() * 200));
    }

    // Get button bounding box and move to it with a natural curve
    const box = await button.boundingBox();
    if (box) {
      // Move to a random point within the button
      const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
      const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);
      await page.mouse.move(targetX, targetY, { steps: 15 + Math.floor(Math.random() * 10) });
      await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
    }

    await button.click();
    await page.waitForTimeout(1500 + Math.floor(Math.random() * 1500));
  }
}

async function main() {
  console.log(`\n🔍 Analyzing live Amazon page for: "${searchTerm}"`);
  console.log(`   Options: save=${shouldSave}, headed=${headed}\n`);

  const browser = await chromium.launch({
    headless: !headed,
    slowMo: slow ? 200 : 0,
    channel: "msedge",
    args: [
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    javaScriptEnabled: true,
  });

  // Mask webdriver property to reduce bot detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  const page = await context.newPage();

  try {
    // Navigate to Amazon homepage first (less likely to trigger CAPTCHA)
    console.log("📡 Navigating to Amazon homepage...");
    await page.goto("https://www.amazon.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Handle Amazon's "Continue shopping" interstitial
    await handleContinueShopping(page);

    // Debug: check page title
    let pageTitle = await page.title();
    console.log(`   Page title: "${pageTitle}"`);

    // If still on a CAPTCHA/block page, try one more round
    if (
      pageTitle.includes("Robot Check") ||
      pageTitle.includes("CAPTCHA") ||
      pageTitle.includes("Sorry") ||
      !pageTitle.includes("Amazon")
    ) {
      console.log("   Retrying CAPTCHA handling...");
      await handleContinueShopping(page);
      await page.waitForTimeout(2000);
      pageTitle = await page.title();
      console.log(`   Page title after retry: "${pageTitle}"`);
    }

    // Find the search box — try multiple known selectors
    const searchBoxSelectors = [
      '#twotabsearchtextbox',
      '#nav-search-bar-form input[type="text"]',
      'input[name="field-keywords"]:visible',
      'form[role="search"] input[type="text"]',
      'input[aria-label*="Search"]',
    ];

    let searchBox = null;
    for (const sel of searchBoxSelectors) {
      const loc = page.locator(sel).first();
      const visible = await loc.isVisible().catch(() => false);
      if (visible) {
        searchBox = loc;
        console.log(`   Found search box: ${sel}`);
        break;
      }
    }

    if (!searchBox) {
      // Save a debug screenshot
      const screenshotPath = path.join(ROOT, "example_pages", "debug-homepage.png");
      await page.screenshot({ path: screenshotPath });
      console.error(`🚫 Could not find search box. Screenshot saved to ${screenshotPath}`);
      // Dump visible input elements for debugging
      const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(i => ({
          id: i.id,
          name: i.name,
          type: i.type,
          visible: i.offsetParent !== null,
          ariaLabel: i.ariaLabel,
        }));
      });
      console.log("   Available inputs:", JSON.stringify(inputs, null, 2));
      await browser.close();
      process.exit(1);
    }

    // Type character by character like a human
    console.log(`🔍 Searching for: "${searchTerm}"`);
    await searchBox.click();
    await searchBox.pressSequentially(searchTerm, { delay: 80 });
    await page.waitForTimeout(800);
    await page.keyboard.press("Enter");

    // Build a realistic-looking search URL for the report
    const crid = generateCrid();
    const sprefix = `${searchTerm.substring(0, Math.min(searchTerm.length, 10)).replace(/ /g, "+")}%2Caps%2C${150 + Math.floor(Math.random() * 100)}`;
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm)}&crid=${crid}&sprefix=${sprefix}&ref=nb_sb_noss_2`;

    // Wait for search results to load
    console.log("⏳ Waiting for search results...");
    await page
      .waitForSelector(SELECTORS.productCard, { timeout: 20000 })
      .catch(() => {
        console.log(
          "⚠️  No product cards found with primary selector, trying to wait longer...",
        );
      });

    // Give extra time for dynamic content (brands, ratings are often lazy-loaded)
    await page.waitForTimeout(4000);

    // Handle "Continue shopping" on search results page too
    await handleContinueShopping(page);

    // Inject selectors into the page context to avoid tsx __name issue
    await page.evaluate((sels) => {
      (window as any).__BAS_SELECTORS = sels;
    }, SELECTORS);

    // Run analysis in the browser context (no closure capture)
    const analysis = await page.evaluate(() => {
      const selectors = (window as any).__BAS_SELECTORS;
      const cards = document.querySelectorAll(
        selectors.productCard,
      ) as NodeListOf<HTMLElement>;
        const results: CardAnalysis[] = [];

        for (const card of cards) {
          const asin = card.dataset.asin || "unknown";
          const titleEl = card.querySelector(
            selectors.titleText,
          );
          const title = titleEl?.textContent?.trim() || "";

          // === BRAND analysis ===
          const h2 = card.querySelector("h2");
          const h2Container =
            h2?.closest(".a-section, .a-row, div") || h2?.parentElement;
          const byLinkEl = h2Container?.querySelector(
            'a[href*="/s?"], a[href*="field-brandtextbin"]',
          );
          const byLink = byLinkEl?.textContent?.trim() || null;

          const visitMatch = card.textContent?.match(
            /Visit the\s+(.+?)\s+Store/i,
          );
          const visitStore = visitMatch ? visitMatch[1].trim() : null;

          const byMatch = card.textContent?.match(
            /\bby\s+([A-Z][A-Za-z&'.+-]+(?:\s+[A-Z][A-Za-z&'.+-]+){0,2})/,
          );
          let byPattern: string | null = null;
          if (byMatch) {
            const candidate = byMatch[1].trim();
            const falsePositives = /^(Amazon|the|this|that|an?)\b/i;
            if (!falsePositives.test(candidate) && candidate.length > 1) {
              byPattern = candidate;
            }
          }

          const baseRowEl = card.querySelector(
            "div.a-row.a-size-base > span.a-size-base-plus.a-color-base",
          );
          const baseRowSpan = baseRowEl?.textContent?.trim() || null;
          const h5El = card.querySelector("h5.s-line-clamp-1 > span");
          const h5Span = h5El?.textContent?.trim() || null;
          const btbEl = card.querySelector<HTMLAnchorElement>(
            'a[href*="brandtextbin"]',
          );
          const brandtextbinLink = btbEl?.textContent?.trim() || null;
          const ariaEl = card.querySelector<HTMLAnchorElement>(
            'a[aria-label*="brand" i]',
          );
          const ariaLabelLink = ariaEl?.textContent?.trim() || null;

          // Title-based brand extraction (Strategy 6)
          let titleBrand: string | null = null;
          if (title) {
            const genericStarters = new Set([
              "wireless", "bluetooth", "true", "sports", "premium", "professional",
              "portable", "mini", "ultra", "super", "new", "upgraded", "original",
              "genuine", "official", "authentic", "classic", "advanced", "smart",
              "digital", "electric", "automatic", "universal", "adjustable",
              "waterproof", "rechargeable", "foldable", "lightweight", "compact",
              "heavy", "duty", "high", "quality", "best", "top", "pro", "max",
              "the", "a", "an", "for", "with", "and", "in", "on", "to", "of",
              "2024", "2025", "2026",
            ]);
            const firstWord = title.split(/[\s,\-]+/)[0];
            if (
              firstWord &&
              firstWord.length >= 2 &&
              firstWord.length <= 30 &&
              !genericStarters.has(firstWord.toLowerCase()) &&
              /^[A-Z]/.test(firstWord)
            ) {
              titleBrand = firstWord;
            }
          }

          const resolved =
            byLink ||
            visitStore ||
            byPattern ||
            baseRowSpan ||
            h5Span ||
            brandtextbinLink ||
            ariaLabelLink ||
            titleBrand ||
            "Unknown";

          // === RATING analysis ===
          const starIconEl = card.querySelector(
            'i[class*="a-icon-star"] span.a-icon-alt',
          );
          const starIconAlt = starIconEl?.textContent?.trim() || null;
          const ariaLabelEl = card.querySelector(
            'a[aria-label*="out of 5 stars"]',
          );
          const ratingAriaLabel =
            ariaLabelEl?.getAttribute("aria-label") || null;
          const spanAriaEl = card.querySelector('span[aria-label*="star"]');
          const spanAriaLabel =
            spanAriaEl?.getAttribute("aria-label") || null;
          const legacyEl = card.querySelector(
            "i.a-icon-star-small span.a-icon-alt",
          );
          const legacyStarSmall = legacyEl?.textContent?.trim() || null;
          const miniEl = card.querySelector(
            "i.a-icon-star-mini span.a-icon-alt",
          );
          const miniStar = miniEl?.textContent?.trim() || null;

          const ratingText =
            starIconAlt || ratingAriaLabel || spanAriaLabel || "";
          const ratingMatch = ratingText.match(/([\d.]+)\s*out of\s*5/);
          const resolvedRating = ratingMatch
            ? parseFloat(ratingMatch[1])
            : 0;

          // === REVIEW COUNT analysis ===
          const revLinkEl = card.querySelector<HTMLAnchorElement>(
            'a[href*="customerReviews"]',
          );
          const revLinkSpan = revLinkEl?.querySelector("span");
          const customerReviewsLink =
            (
              revLinkSpan?.textContent ||
              revLinkEl?.textContent ||
              ""
            ).trim() || null;

          let underlinedSpan: string | null = null;
          const underlined = card.querySelectorAll("span.s-underline-text");
          for (const span of underlined) {
            const text = span.textContent?.trim() || "";
            if (/^[\d,.()]+[kKmMbB]?$/.test(text.replace(/[()]/g, ""))) {
              underlinedSpan = text;
              break;
            }
          }

          let ariaRating: string | null = null;
          const ariaEls = card.querySelectorAll(
            '[aria-label*="rating" i], [aria-label*="review" i]',
          );
          for (const el of ariaEls) {
            const label = el.getAttribute("aria-label") || "";
            const match = label.match(
              /([\d,.]+[kKmMbB]?)\s*(?:rating|review)/i,
            );
            if (match) {
              ariaRating = match[1];
              break;
            }
          }

          const parseCount = (t: string | null): number => {
            if (!t) return 0;
            const cleaned = t.replace(/[(),]/g, "").trim();
            const m = cleaned.match(/([\d.]+)\s*([kKmMbB])?/);
            if (!m) return 0;
            let n = parseFloat(m[1]);
            const suffix = (m[2] || "").toUpperCase();
            if (suffix === "K") n *= 1000;
            if (suffix === "M") n *= 1000000;
            return Math.round(n);
          };

          const resolvedReviewCount =
            parseCount(customerReviewsLink) ||
            parseCount(underlinedSpan) ||
            parseCount(ariaRating);

          // === PRICE analysis ===
          const offscreenEl = card.querySelector(
            "span.a-price span.a-offscreen",
          );
          const priceOffscreen = offscreenEl?.textContent?.trim() || null;
          const wholeEl = card.querySelector("span.a-price-whole");
          const priceWhole = wholeEl?.textContent?.trim() || null;
          const priceText =
            priceOffscreen || (priceWhole ? `$${priceWhole}` : null);
          const priceMatch = priceText?.match(/\$?([\d,.]+)/);
          const resolvedPrice = priceMatch
            ? parseFloat(priceMatch[1].replace(/,/g, ""))
            : null;

          // === SPONSORED detection ===
          let isSponsored = false;
          if (
            card.querySelector(
              'span[data-component-type="s-ads-metrics"]',
            )
          )
            isSponsored = true;
          if (
            card.querySelector(
              '[data-component-type="sp-sponsored-result"]',
            )
          )
            isSponsored = true;
          if (card.querySelector("div.AdHolder, div.s-ad-holder"))
            isSponsored = true;
          if (
            card.dataset.isSponsored === "true" ||
            card.dataset.sponsored === "true"
          )
            isSponsored = true;
          if (!isSponsored) {
            const ariaAll = card.querySelectorAll("[aria-label]");
            for (const el of ariaAll) {
              if (
                /\bsponsored\b/i.test(
                  el.getAttribute("aria-label") || "",
                )
              ) {
                isSponsored = true;
                break;
              }
            }
          }
          if (!isSponsored) {
            const spans = card.querySelectorAll(
              "span.a-color-secondary, span.puis-label-popover-default",
            );
            for (const span of spans) {
              const text = span.textContent?.trim().toLowerCase() || "";
              if (
                text === "sponsored" ||
                text === "ad" ||
                /^sponsored\b/.test(text)
              ) {
                isSponsored = true;
                break;
              }
            }
          }

          results.push({
            asin,
            title: title.substring(0, 80),
            isSponsored,
            brand: {
              byLink,
              visitStore,
              byPattern,
              baseRowSpan,
              h5Span,
              brandtextbinLink,
              ariaLabelLink,
              resolved,
            },
            rating: {
              starIconAlt,
              ariaLabel: ratingAriaLabel,
              spanAriaLabel,
              legacyStarSmall,
              miniStar,
              resolved: resolvedRating,
            },
            reviewCount: {
              customerReviewsLink,
              underlinedSpan,
              ariaRating,
              resolved: resolvedReviewCount,
            },
            price: {
              offscreen: priceOffscreen,
              whole: priceWhole,
              resolved: resolvedPrice,
            },
          });
        }

        // === GLOBAL selectors ===
        const sidebarSections: string[] = [];
        const sidebar = document.querySelector(
          "#s-refinements, #leftNavContainer",
        );
        if (sidebar) {
          const headings = sidebar.querySelectorAll(
            "h2, h3, h4, .a-text-bold",
          );
          for (const h of headings) {
            const text = h.textContent?.trim();
            if (text) sidebarSections.push(text);
          }
        }

        const carouselCount = document.querySelectorAll(
          'div[class*="_c2Itd_"]',
        ).length;

        // Selector coverage summary
        const coverage: Record<
          string,
          { matches: number; pct: string }
        > = {};
        const totalCards = cards.length || 1;
        for (const [name, sel] of Object.entries(selectors)) {
          let count = 0;
          for (const card of cards) {
            if (card.querySelector(sel)) count++;
          }
          coverage[name] = {
            matches: count,
            pct: `${((count / totalCards) * 100).toFixed(1)}%`,
          };
        }

        return {
          totalCards: cards.length,
          sponsoredCards: results.filter((r: any) => r.isSponsored).length,
          cards: results,
          sidebarSections,
          carouselCount,
          selectorCoverage: coverage,
        };
      });

    // Get the full rendered HTML if saving
    let renderedHtml = "";
    if (shouldSave) {
      renderedHtml = await page.content();
    }

    await browser.close();

    // ── Print results ──────────────────────────────────────────────
    const report: PageAnalysis = {
      url: searchUrl,
      searchTerm,
      timestamp: new Date().toISOString(),
      ...analysis,
    };

    console.log("\n" + "=".repeat(70));
    console.log(`  LIVE PAGE ANALYSIS: "${searchTerm}"`);
    console.log("=".repeat(70));
    console.log(`  URL: ${searchUrl}`);
    console.log(
      `  Cards: ${report.totalCards} (${report.sponsoredCards} sponsored)`,
    );
    console.log(`  Sidebar sections: ${report.sidebarSections.length}`);
    console.log(`  Carousels (_c2Itd_): ${report.carouselCount}`);

    // Selector coverage
    console.log(
      "\n-- Selector Coverage (per-card) ---------------------------------",
    );
    const maxNameLen = Math.max(
      ...Object.keys(report.selectorCoverage).map((k) => k.length),
    );
    for (const [name, data] of Object.entries(report.selectorCoverage)) {
      const pctNum = parseFloat(data.pct);
      const bar =
        "#".repeat(Math.round(pctNum / 5)) || (data.matches > 0 ? "#" : ".");
      console.log(
        `  ${name.padEnd(maxNameLen)}  ${String(data.matches).padStart(3)}/${report.totalCards}  ${data.pct.padStart(6)}  ${bar}`,
      );
    }

    // Sidebar sections
    if (report.sidebarSections.length > 0) {
      console.log(
        "\n-- Sidebar Sections ---------------------------------------------",
      );
      for (const s of report.sidebarSections) {
        console.log(`  * ${s}`);
      }
    } else {
      console.log("\n  WARNING: No sidebar sections found");
    }

    // Per-card breakdown
    console.log(
      "\n-- Per-Card Extraction Results ----------------------------------",
    );
    const nonSponsored = report.cards.filter((c) => !c.isSponsored);

    // Summary stats
    const brandStats = {
      byLink: nonSponsored.filter((c) => c.brand.byLink).length,
      visitStore: nonSponsored.filter((c) => c.brand.visitStore).length,
      byPattern: nonSponsored.filter((c) => c.brand.byPattern).length,
      baseRowSpan: nonSponsored.filter((c) => c.brand.baseRowSpan).length,
      h5Span: nonSponsored.filter((c) => c.brand.h5Span).length,
      brandtextbin: nonSponsored.filter((c) => c.brand.brandtextbinLink)
        .length,
      ariaLabel: nonSponsored.filter((c) => c.brand.ariaLabelLink).length,
      resolved: nonSponsored.filter((c) => c.brand.resolved !== "Unknown")
        .length,
      unknown: nonSponsored.filter((c) => c.brand.resolved === "Unknown")
        .length,
    };

    const ratingStats = {
      starIconAlt: nonSponsored.filter((c) => c.rating.starIconAlt).length,
      ariaLabel: nonSponsored.filter((c) => c.rating.ariaLabel).length,
      spanAria: nonSponsored.filter((c) => c.rating.spanAriaLabel).length,
      legacy: nonSponsored.filter((c) => c.rating.legacyStarSmall).length,
      mini: nonSponsored.filter((c) => c.rating.miniStar).length,
      resolved: nonSponsored.filter((c) => c.rating.resolved > 0).length,
    };

    const reviewStats = {
      reviewLink: nonSponsored.filter(
        (c) => c.reviewCount.customerReviewsLink,
      ).length,
      underlined: nonSponsored.filter((c) => c.reviewCount.underlinedSpan)
        .length,
      ariaRating: nonSponsored.filter((c) => c.reviewCount.ariaRating)
        .length,
      resolved: nonSponsored.filter((c) => c.reviewCount.resolved > 0)
        .length,
    };

    const priceStats = {
      offscreen: nonSponsored.filter((c) => c.price.offscreen).length,
      whole: nonSponsored.filter((c) => c.price.whole).length,
      resolved: nonSponsored.filter((c) => c.price.resolved !== null).length,
    };

    const ns = nonSponsored.length || 1;
    console.log(`\n  Non-sponsored cards: ${nonSponsored.length}`);

    console.log(
      `\n  BRAND extraction (${brandStats.resolved}/${nonSponsored.length} resolved):`,
    );
    console.log(
      `    Strategy 1 - by-link:        ${brandStats.byLink}/${ns} (${((brandStats.byLink / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    Strategy 2 - Visit Store:     ${brandStats.visitStore}/${ns} (${((brandStats.visitStore / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    Strategy 3 - "by X" regex:    ${brandStats.byPattern}/${ns} (${((brandStats.byPattern / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    Strategy 4 - base-row span:   ${brandStats.baseRowSpan}/${ns} (${((brandStats.baseRowSpan / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    Strategy 4b - h5 span:        ${brandStats.h5Span}/${ns} (${((brandStats.h5Span / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    Strategy 5 - brandtextbin:    ${brandStats.brandtextbin}/${ns} (${((brandStats.brandtextbin / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    Strategy 5b - aria-label:     ${brandStats.ariaLabel}/${ns} (${((brandStats.ariaLabel / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    UNKNOWN:                      ${brandStats.unknown}/${ns}`,
    );

    console.log(
      `\n  RATING extraction (${ratingStats.resolved}/${nonSponsored.length} resolved):`,
    );
    console.log(
      `    i[a-icon-star] .a-icon-alt:  ${ratingStats.starIconAlt}/${ns} (${((ratingStats.starIconAlt / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    a[aria-label*=stars]:         ${ratingStats.ariaLabel}/${ns} (${((ratingStats.ariaLabel / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    span[aria-label*=star]:       ${ratingStats.spanAria}/${ns} (${((ratingStats.spanAria / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    i.a-icon-star-small (legacy): ${ratingStats.legacy}/${ns} (${((ratingStats.legacy / ns) * 100).toFixed(0)}%)`,
    );
    console.log(
      `    i.a-icon-star-mini:           ${ratingStats.mini}/${ns} (${((ratingStats.mini / ns) * 100).toFixed(0)}%)`,
    );

    console.log(
      `\n  REVIEW COUNT extraction (${reviewStats.resolved}/${nonSponsored.length} resolved):`,
    );
    console.log(
      `    customerReviews link:         ${reviewStats.reviewLink}/${ns}`,
    );
    console.log(
      `    underlined span:              ${reviewStats.underlined}/${ns}`,
    );
    console.log(
      `    aria rating/review:           ${reviewStats.ariaRating}/${ns}`,
    );

    console.log(
      `\n  PRICE extraction (${priceStats.resolved}/${nonSponsored.length} resolved):`,
    );
    console.log(
      `    a-offscreen:                  ${priceStats.offscreen}/${ns}`,
    );
    console.log(
      `    a-price-whole:                ${priceStats.whole}/${ns}`,
    );

    // Show first few card details
    console.log(
      "\n-- Sample Cards -------------------------------------------------",
    );
    for (const card of nonSponsored.slice(0, 5)) {
      console.log(`\n  ASIN: ${card.asin}`);
      console.log(`  Title: ${card.title}`);
      console.log(
        `  Brand: ${card.brand.resolved} [via: ${getBrandSource(card)}]`,
      );
      console.log(`  Rating: ${card.rating.resolved} stars`);
      console.log(`  Reviews: ${card.reviewCount.resolved}`);
      console.log(
        `  Price: ${card.price.resolved !== null ? `$${card.price.resolved}` : "N/A"}`,
      );
    }

    // Save rendered HTML
    if (shouldSave && renderedHtml) {
      const slug = searchTerm.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const outPath = path.join(ROOT, "example_pages", `live-${slug}.html`);
      fs.writeFileSync(outPath, renderedHtml, "utf-8");
      console.log(`\nSaved rendered HTML to: ${outPath}`);
      console.log(`   Size: ${(renderedHtml.length / 1024).toFixed(0)} KB`);
    }

    // Save JSON report
    const slug = searchTerm.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const reportPath = path.join(
      ROOT,
      "example_pages",
      `analysis-${slug}.json`,
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(`\nSaved analysis report to: ${reportPath}`);

    // Final recommendations
    console.log(
      "\n-- Recommendations ----------------------------------------------",
    );
    if (brandStats.unknown > ns * 0.3) {
      console.log(
        `  [!] ${brandStats.unknown}/${ns} cards have unknown brands. Consider adding title-based fallback.`,
      );
    }
    if (ratingStats.legacy > 0 && ratingStats.mini === 0) {
      console.log(
        "  [!] Legacy a-icon-star-small found but no a-icon-star-mini. Amazon may be A/B testing.",
      );
    }
    if (ratingStats.mini > 0 && ratingStats.legacy === 0) {
      console.log(
        "  [OK] a-icon-star-mini is the active rating selector (legacy star-small is dead).",
      );
    }
    if (report.sidebarSections.some((s) => /brand/i.test(s))) {
      console.log(
        "  [OK] Brand sidebar section found -- enhanceBrandSection() will work.",
      );
    } else {
      console.log(
        "  [!] No Brand sidebar section -- will fall back to standalone widget.",
      );
    }
    if (report.carouselCount > 0) {
      console.log(
        `  [OK] Found ${report.carouselCount} carousel elements -- sponsored carousel hiding will work.`,
      );
    }

    console.log("\n" + "=".repeat(70) + "\n");
  } catch (err) {
    console.error("Error:", err);
    await browser.close();
    process.exit(1);
  }
}

function getBrandSource(card: CardAnalysis): string {
  if (card.brand.byLink) return "byLink (Strategy 1)";
  if (card.brand.visitStore) return "Visit Store (Strategy 2)";
  if (card.brand.byPattern) return "by-regex (Strategy 3)";
  if (card.brand.baseRowSpan) return "base-row (Strategy 4)";
  if (card.brand.h5Span) return "h5 (Strategy 4b)";
  if (card.brand.brandtextbinLink) return "brandtextbin (Strategy 5)";
  if (card.brand.ariaLabelLink) return "aria-label (Strategy 5b)";
  return "none";
}

main();
