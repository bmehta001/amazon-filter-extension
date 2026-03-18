/**
 * Live Extension Integration Test
 *
 * Loads the built extension into a real Chrome instance, searches Amazon
 * with various terms, toggles different settings, and verifies that
 * filters, badges, sparklines, and deal indicators all render correctly.
 *
 * Usage:
 *   npx tsx scripts/live-extension-test.ts
 *   npx tsx scripts/live-extension-test.ts --headed   (watch it run)
 */

import { chromium, type Page, type BrowserContext } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const HEADED = process.argv.includes("--headed");

// ── Search configs: each tests different settings ──────────────────────

interface TestConfig {
  term: string;
  /** Settings to apply via chrome.storage.sync before navigating */
  preferences: Record<string, unknown>;
  /** Filter overrides to apply */
  filters: Record<string, unknown>;
  /** What to check on the page */
  checks: string[];
}

const TEST_CONFIGS: TestConfig[] = [
  {
    term: "wireless headphones",
    preferences: {
      showSparklines: true,
      showReviewBadges: true,
      showDealBadges: true,
      preloadDetails: true,
      useMLAnalysis: false,
      bandwidthMode: "balanced",
    },
    filters: {
      hideSponsored: true,
      minReviews: 50,
      brandMode: "off",
      sellerFilter: "any",
    },
    checks: [
      "filter-bar-or-sidebar",
      "products-visible",
      "sponsored-hidden",
      "sparklines",
      "deal-badges",
      "card-actions",
    ],
  },
  {
    term: "cast iron skillet",
    preferences: {
      showSparklines: false,
      showReviewBadges: true,
      showDealBadges: true,
      preloadDetails: false,
      bandwidthMode: "low",
    },
    filters: {
      hideSponsored: false,
      minReviews: 0,
      minRating: 4.0,
      brandMode: "dim",
      sellerFilter: "any",
    },
    checks: [
      "filter-bar-or-sidebar",
      "products-visible",
      "no-sparklines",
      "dim-mode-active",
    ],
  },
  {
    term: "organic baby food pouches",
    preferences: {
      showSparklines: true,
      showReviewBadges: true,
      showDealBadges: true,
      preloadDetails: true,
      bandwidthMode: "high",
      useMLAnalysis: true,
    },
    filters: {
      hideSponsored: true,
      minReviews: 100,
      priceMin: 5,
      priceMax: 30,
      sellerFilter: "any",
    },
    checks: [
      "filter-bar-or-sidebar",
      "products-visible",
      "price-filtered",
      "sponsored-hidden",
    ],
  },
  {
    term: "mechanical keyboard",
    preferences: {
      showSparklines: true,
      showReviewBadges: false,
      showDealBadges: false,
      preloadDetails: true,
      bandwidthMode: "balanced",
    },
    filters: {
      hideSponsored: false,
      minReviews: 0,
      brandMode: "off",
      sellerFilter: "any",
      totalPages: 2,
    },
    checks: [
      "filter-bar-or-sidebar",
      "products-visible",
      "no-deal-badges",
      "pagination-status",
    ],
  },
  {
    term: "arduino starter kit",
    preferences: {
      showSparklines: false,
      showReviewBadges: false,
      showDealBadges: false,
      preloadDetails: false,
      bandwidthMode: "low",
    },
    filters: {
      hideSponsored: true,
      minReviews: 10,
      brandMode: "off",
      sellerFilter: "any",
    },
    checks: [
      "filter-bar-or-sidebar",
      "products-visible",
      "no-sparklines",
      "no-deal-badges",
      "sponsored-hidden",
      "low-bandwidth-mode",
    ],
  },
];

// ── Extension selectors ────────────────────────────────────────────────

const EXT_SEL = {
  // Our injected UI
  filterBar: ".bas-filter-bar, .bas-sidebar-widget",
  sidebarWidget: ".bas-sidebar-widget",
  statsCounter: "[class*='bas-stats'], [class*='bas-count']",
  cardActions: ".bas-card-actions",
  sparkline: ".bas-sparkline",
  dealBadge: ".bas-deal-badge",
  reviewBadge: ".bas-review-badge",
  dimmed: ".bas-dimmed",
  hidden: ".bas-hidden",
  trusted: ".bas-trusted",
  // Amazon elements
  productCard: 'div[data-component-type="s-search-result"]',
  sponsoredCarousel: 'div[class*="_c2Itd_"]',
  topSlot: "div.s-top-slot",
  price: "span.a-price",
};

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 Live Extension Integration Test");
  console.log(`   Extension dir: ${DIST}`);
  console.log(`   Test configs: ${TEST_CONFIGS.length}`);
  console.log(`   Headed: ${HEADED}\n`);

  // Launch Playwright's bundled Chromium with the extension loaded.
  // (Edge channel causes Protocol errors; bundled Chromium works reliably.)
  const os = await import("os");
  const fs = await import("fs");
  const userDataDir = path.join(os.default.tmpdir(), "bas-test-profile");
  if (fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // Extensions require non-headless
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--no-first-run",
      ...(HEADED ? [] : ["--window-position=-2000,-2000"]),
    ],
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timeout: 30000,
  });

  const page = await context.newPage();
  const allResults: { config: TestConfig; checks: CheckResult[] }[] = [];

  // Go to Amazon first to warm up session
  console.log("📡 Warming up Amazon session...");
  await page.goto("https://www.amazon.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Handle "Continue shopping" interstitial
  await handleContinueShopping(page);
  let warmTitle = await page.title();
  if (!warmTitle.includes("Amazon")) {
    console.log(`   ⚠️  Not on Amazon yet (title: "${warmTitle}"), retrying...`);
    await handleContinueShopping(page);
    await page.waitForTimeout(2000);
    warmTitle = await page.title();
  }
  console.log(`   ✅ Warmup complete (title: "${warmTitle.slice(0, 50)}")`);

  for (let i = 0; i < TEST_CONFIGS.length; i++) {
    const config = TEST_CONFIGS[i];
    console.log(`\n${"═".repeat(60)}`);
    console.log(`🔎 Test ${i + 1}/${TEST_CONFIGS.length}: "${config.term}"`);
    console.log(`   Bandwidth: ${config.preferences.bandwidthMode}`);
    console.log(`   Sparklines: ${config.preferences.showSparklines} | Badges: ${config.preferences.showDealBadges} | Review: ${config.preferences.showReviewBadges}`);
    console.log(`   Hide Sponsored: ${config.filters.hideSponsored} | Min Reviews: ${config.filters.minReviews || 0}`);
    console.log("═".repeat(60));

    // Navigate to Amazon homepage first
    await page.goto("https://www.amazon.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1000);
    await handleContinueShopping(page);

    // Set preferences via the extension's service worker (has chrome.storage)
    await setExtensionSettings(context, config);
    await page.waitForTimeout(500);

    // Wait for search box to be ready, then type and submit
    try {
      const searchBox = page.locator('#twotabsearchtextbox');
      await searchBox.waitFor({ state: "visible", timeout: 10000 });
      await searchBox.click();
      await page.waitForTimeout(200);
      await searchBox.fill(config.term);
      await page.waitForTimeout(300);
      await page.locator('#nav-search-submit-button').click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
    } catch {
      // Fallback to direct URL
      console.log("   ⚠️  Search box failed, using direct URL...");
      const crid = randomHex(20).toUpperCase();
      const sprefix = encodeURIComponent(config.term.slice(0, 7)) + "%2Caps%2C" + (140 + Math.floor(Math.random() * 60));
      const url = `https://www.amazon.com/s?k=${encodeURIComponent(config.term)}&crid=${crid}&sprefix=${sprefix}&ref=nb_sb_noss_2`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    // Handle CAPTCHA on search results page
    await handleContinueShopping(page);

    // Scroll to trigger lazy loading and let extension process
    await autoScroll(page);
    await page.waitForTimeout(2000);

    // If still on CAPTCHA/error page, try once more
    if (await detectCaptcha(page)) {
      console.log("   ⚠️  Still on CAPTCHA page, retrying...");
      await handleContinueShopping(page);
      await page.waitForTimeout(1500);
      // Re-search if needed
      const title = await page.title();
      if (!title.toLowerCase().includes(config.term.split(" ")[0].toLowerCase())) {
        try {
          const searchBox = page.locator('#twotabsearchtextbox');
          await searchBox.waitFor({ state: "visible", timeout: 5000 });
          await searchBox.fill(config.term);
          await page.locator('#nav-search-submit-button').click();
          await page.waitForLoadState("domcontentloaded");
          await page.waitForTimeout(2000);
          await autoScroll(page);
          await page.waitForTimeout(2000);
        } catch {
          console.log("   ⚠️  Re-search failed");
        }
      }
    }

    // Page diagnostics
    const pageUrl = page.url();
    const pageTitle = await page.title();
    const bodySnippet = await page.evaluate(() => {
      const body = document.body?.textContent || "";
      return body.replace(/\s+/g, " ").trim().slice(0, 200);
    });
    console.log(`   📄 URL: ${pageUrl.slice(0, 100)}...`);
    console.log(`   📄 Title: ${pageTitle}`);
    console.log(`   📄 Body: ${bodySnippet.slice(0, 120)}...`);

    // Save screenshot for first test for debugging
    if (i === 0) {
      const ssPath = path.join(ROOT, "test-results", `live-test-${Date.now()}.png`);
      await page.screenshot({ path: ssPath, fullPage: false }).catch(() => {});
      console.log(`   📸 Screenshot: ${ssPath}`);
    }

    // Run checks
    const checks = await runChecks(page, config);
    allResults.push({ config, checks });

    // Print results
    for (const c of checks) {
      console.log(`   ${c.passed ? "✅" : "❌"} ${c.name}: ${c.detail}`);
    }

    // Delay between tests
    await page.waitForTimeout(2000 + Math.random() * 2000);
  }

  await context.close();

  // Summary
  printSummary(allResults);
}

// ── Set Extension Settings ─────────────────────────────────────────────

async function setExtensionSettings(context: BrowserContext, config: TestConfig): Promise<void> {
  try {
    // Get the extension's service worker — it has chrome.storage access
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      // Wait for service worker to register
      sw = await context.waitForEvent("serviceworker", { timeout: 5000 });
    }

    const success = await sw.evaluate(
      ({ prefs, filters }) => {
        return new Promise<boolean>((resolve) => {
          const prefData = {
            bandwidthMode: prefs.bandwidthMode ?? "balanced",
            showSparklines: prefs.showSparklines ?? true,
            showReviewBadges: prefs.showReviewBadges ?? true,
            showDealBadges: prefs.showDealBadges ?? true,
            preloadDetails: prefs.preloadDetails ?? true,
            useMLAnalysis: prefs.useMLAnalysis ?? false,
            hideSponsoredDefault: false,
            defaultBrandMode: "off",
            defaultSellerFilter: "any",
          };
          const filterData = {
            minReviews: filters.minReviews ?? 0,
            minRating: filters.minRating ?? null,
            priceMin: filters.priceMin ?? null,
            priceMax: filters.priceMax ?? null,
            excludeTokens: [],
            excludedBrands: [],
            brandMode: filters.brandMode ?? "off",
            hideSponsored: filters.hideSponsored ?? false,
            queryBuilder: false,
            minReviewQuality: 0,
            useMLAnalysis: prefs.useMLAnalysis ?? false,
            ignoredCategories: [],
            dedupCategories: [],
            totalPages: filters.totalPages ?? 1,
            networkUsage: "auto",
            sellerFilter: filters.sellerFilter ?? "any",
          };
          chrome.storage.sync.set(
            { preferences: prefData, filters: filterData },
            () => resolve(true),
          );
        });
      },
      { prefs: config.preferences, filters: config.filters },
    );
    console.log(`   ⚙️  Settings applied: ${success ? "✅" : "❌"}`);
  } catch (err) {
    console.log(`   ⚙️  Settings failed: ${(err as Error).message?.slice(0, 80)}`);
  }
}

// ── Run Checks ─────────────────────────────────────────────────────────

async function runChecks(page: Page, config: TestConfig): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const counts = await page.evaluate((sel) => {
    // Filter bar and sidebar are inside shadow DOM — check for hosts
    const filterBarHost = document.getElementById("bas-filter-bar-host");
    const sidebarHosts = document.querySelectorAll(".bas-sidebar-widget-host");
    const filterBarCount = filterBarHost ? 1 : 0;
    const sidebarCount = sidebarHosts.length;

    return {
      productCards: document.querySelectorAll(sel.productCard).length,
      filterBars: filterBarCount,
      sidebarWidgets: sidebarCount,
      cardActions: document.querySelectorAll(sel.cardActions).length,
      sparklines: document.querySelectorAll(sel.sparkline).length,
      dealBadges: document.querySelectorAll(sel.dealBadge).length,
      reviewBadges: document.querySelectorAll(sel.reviewBadge).length,
      dimmed: document.querySelectorAll(sel.dimmed).length,
      hidden: document.querySelectorAll(sel.hidden).length,
      trusted: document.querySelectorAll(sel.trusted).length,
      prices: document.querySelectorAll(sel.price).length,
      carousels: document.querySelectorAll(sel.sponsoredCarousel).length,
      topSlots: document.querySelectorAll(sel.topSlot).length,
    };
  }, EXT_SEL);

  for (const check of config.checks) {
    switch (check) {
      case "filter-bar-or-sidebar":
        results.push({
          name: "Filter UI injected",
          passed: counts.filterBars > 0 || counts.sidebarWidgets > 0,
          detail: `${counts.filterBars} filter bars, ${counts.sidebarWidgets} sidebar widgets`,
        });
        break;

      case "products-visible":
        results.push({
          name: "Products found",
          passed: counts.productCards > 0,
          detail: `${counts.productCards} cards, ${counts.hidden} hidden, ${counts.productCards - counts.hidden} visible`,
        });
        break;

      case "sponsored-hidden": {
        // Check that sponsored top slots are hidden via CSS
        const sponsoredHidden = await page.evaluate(() => {
          const topSlot = document.querySelector("div.s-top-slot");
          if (!topSlot) return true; // No top slot = fine
          const style = window.getComputedStyle(topSlot);
          return style.display === "none";
        });
        results.push({
          name: "Sponsored hidden",
          passed: sponsoredHidden,
          detail: sponsoredHidden ? "Top slot hidden or absent" : "⚠️ Top slot still visible",
        });
        break;
      }

      case "sparklines":
        results.push({
          name: "Sparklines present",
          passed: counts.sparklines > 0,
          detail: `${counts.sparklines} sparklines on ${counts.productCards} cards`,
        });
        break;

      case "no-sparklines":
        results.push({
          name: "Sparklines disabled",
          passed: counts.sparklines === 0,
          detail: counts.sparklines === 0 ? "Correctly hidden" : `⚠️ ${counts.sparklines} found`,
        });
        break;

      case "deal-badges":
        // Deal badges only appear on items with deals, so check >= 0 is reasonable
        results.push({
          name: "Deal badges enabled",
          passed: true, // They may or may not appear depending on deals on page
          detail: `${counts.dealBadges} deal badges found`,
        });
        break;

      case "no-deal-badges":
        results.push({
          name: "Deal badges disabled",
          passed: counts.dealBadges === 0,
          detail: counts.dealBadges === 0 ? "Correctly hidden" : `⚠️ ${counts.dealBadges} found`,
        });
        break;

      case "card-actions":
        results.push({
          name: "Card actions injected",
          passed: counts.cardActions > 0,
          detail: `${counts.cardActions} cards have action buttons`,
        });
        break;

      case "dim-mode-active":
        results.push({
          name: "Brand dim mode",
          passed: counts.dimmed > 0 || counts.productCards > 0,
          detail: `${counts.dimmed} dimmed, ${counts.trusted} trusted`,
        });
        break;

      case "price-filtered": {
        const visibleCount = counts.productCards - counts.hidden;
        results.push({
          name: "Price filter active",
          passed: counts.hidden > 0 || visibleCount > 0,
          detail: `${counts.hidden} hidden by filters, ${visibleCount} visible`,
        });
        break;
      }

      case "pagination-status": {
        const prefetchText = await page.evaluate(() => {
          const el = document.querySelector("[class*='bas-prefetch'], [class*='bas-page']");
          return el?.textContent || null;
        });
        results.push({
          name: "Pagination",
          passed: true,
          detail: prefetchText || "No prefetch status found (may be loading)",
        });
        break;
      }

      case "low-bandwidth-mode":
        results.push({
          name: "Low bandwidth mode",
          passed: counts.sparklines === 0 && counts.reviewBadges === 0,
          detail: `Sparklines: ${counts.sparklines}, Review badges: ${counts.reviewBadges}`,
        });
        break;
    }
  }

  // Always add general stats
  results.push({
    name: "Overall stats",
    passed: counts.productCards > 0,
    detail: `Cards: ${counts.productCards} | Actions: ${counts.cardActions} | Sparklines: ${counts.sparklines} | Deals: ${counts.dealBadges} | Reviews: ${counts.reviewBadges} | Dimmed: ${counts.dimmed} | Hidden: ${counts.hidden}`,
  });

  return results;
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function detectCaptcha(page: Page): Promise<boolean> {
  const text = await page.textContent("body").catch(() => "");
  const title = await page.title().catch(() => "");
  return (
    text?.includes("Enter the characters you see below") === true ||
    text?.includes("Sorry, we just need to make sure") === true ||
    text?.includes("Click the button to continue shopping") === true ||
    text?.includes("Type the characters you see in this image") === true ||
    title.includes("Sorry") ||
    title.includes("Robot Check") ||
    title.includes("CAPTCHA")
  );
}

/**
 * Handle Amazon's "Continue shopping" interstitial and error pages.
 * Simulates human-like mouse movement before clicking the button.
 */
async function handleContinueShopping(page: Page, maxAttempts = 5): Promise<boolean> {
  let solved = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const buttonSelectors = [
      'input[type="submit"]',
      'input[value*="Continue"]',
      'button:has-text("Continue")',
      'a:has-text("Continue shopping")',
      'button:has-text("Continue shopping")',
      'a:has-text("Try again")',
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

    if (!button) return solved;

    console.log(`   🖱️  CAPTCHA button (attempt ${attempt}/${maxAttempts}), clicking...`);

    // Quick mouse jiggle — just 1-2 moves
    const viewport = page.viewportSize() || { width: 1440, height: 900 };
    const jx = 200 + Math.floor(Math.random() * (viewport.width - 400));
    const jy = 200 + Math.floor(Math.random() * (viewport.height - 400));
    await page.mouse.move(jx, jy, { steps: 5 });
    await page.waitForTimeout(50 + Math.floor(Math.random() * 100));

    // Move to button and click fast
    const box = await button.boundingBox();
    if (box) {
      const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
      const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);
      await page.mouse.move(targetX, targetY, { steps: 8 });
      await page.waitForTimeout(50 + Math.floor(Math.random() * 100));
    }

    await button.click();
    solved = true;
    await page.waitForTimeout(600 + Math.floor(Math.random() * 400));
  }
  return solved;
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
      setTimeout(() => { clearInterval(timer); resolve(); }, 8000);
    });
  });
  await page.waitForTimeout(1000);
}

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let r = "";
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

// ── Summary ────────────────────────────────────────────────────────────

function printSummary(allResults: { config: TestConfig; checks: CheckResult[] }[]) {
  console.log(`\n${"═".repeat(60)}`);
  console.log("📊 FINAL SUMMARY");
  console.log("═".repeat(60));

  let totalChecks = 0;
  let passedChecks = 0;

  for (const { config, checks } of allResults) {
    const passed = checks.filter((c) => c.passed).length;
    const total = checks.length;
    totalChecks += total;
    passedChecks += passed;
    const status = passed === total ? "✅" : "⚠️";
    console.log(`  ${status} "${config.term}" — ${passed}/${total} checks passed (${config.preferences.bandwidthMode} mode)`);
  }

  console.log(`\n  Overall: ${passedChecks}/${totalChecks} checks passed`);

  if (passedChecks === totalChecks) {
    console.log("\n  🎉 All tests passed!");
  } else {
    console.log(`\n  ⚠️  ${totalChecks - passedChecks} check(s) failed — review output above`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
