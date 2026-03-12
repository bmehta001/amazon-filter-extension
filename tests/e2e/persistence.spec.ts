/**
 * Playwright E2E test for extension settings persistence.
 *
 * Tests that filter settings survive page navigations within
 * a browsing session by loading the extension in a real Chromium
 * instance with a persistent context.
 *
 * Requires: `npm run build` first (loads from dist/).
 */

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, "../../dist");

/**
 * Create a mock Amazon search results page for testing.
 * Generates a realistic HTML structure matching Amazon's DOM layout.
 */
function buildMockAmazonSearchPage(products: MockProduct[]): string {
  const cards = products.map(
    (p) => `
    <div data-component-type="s-search-result" data-asin="${p.asin}" class="s-result-item">
      <div class="a-section">
        <h2>
          <a class="a-link-normal" href="/dp/${p.asin}">
            <span class="a-text-normal">${p.title}</span>
          </a>
        </h2>
      </div>
      ${p.brand ? `<span class="a-size-base-plus a-color-base">${p.brand}</span>` : ""}
      ${p.rating ? `<i class="a-icon-star-small"><span class="a-icon-alt">${p.rating} out of 5 stars</span></i>` : ""}
      ${p.reviewCount ? `<span class="a-size-base s-underline-text">${p.reviewCount}</span>` : ""}
      ${p.price ? `<span class="a-price"><span class="a-offscreen">${p.price}</span></span>` : ""}
      ${p.sponsored ? '<span class="a-color-secondary">Sponsored</span>' : ""}
    </div>
  `,
  );

  return `<!DOCTYPE html>
<html>
<head><title>Amazon.com : test search</title></head>
<body>
  <div id="search">
    <div data-component-type="s-search-results">
      <div class="s-main-slot">
        ${cards.join("\n")}
      </div>
    </div>
  </div>
  <input id="twotabsearchtextbox" name="field-keywords" value="test search" />
</body>
</html>`;
}

interface MockProduct {
  asin: string;
  title: string;
  brand?: string;
  rating?: string;
  reviewCount?: string;
  price?: string;
  sponsored?: boolean;
}

const MOCK_PRODUCTS: MockProduct[] = [
  {
    asin: "B08N5WRWNW",
    title: "Sony WH-1000XM4 Wireless Headphones",
    brand: "Sony",
    rating: "4.7",
    reviewCount: "45,678",
    price: "$278.00",
  },
  {
    asin: "B09V3KXJPB",
    title: "Cheap Knockoff Earbuds Refurbished",
    brand: "XKZTQ",
    rating: "2.1",
    reviewCount: "12",
    price: "$5.99",
    sponsored: true,
  },
  {
    asin: "B07FZ8S74R",
    title: "Bose QuietComfort 45 Headphones",
    brand: "Bose",
    rating: "4.6",
    reviewCount: "32,100",
    price: "$329.00",
  },
  {
    asin: "B0BSHF7WHW",
    title: "Apple AirPods Pro 2nd Gen",
    brand: "Apple",
    rating: "4.8",
    reviewCount: "89,000",
    price: "$189.99",
  },
  {
    asin: "B0000CCCCC",
    title: "Budget Wireless Earbuds 45W Charger",
    brand: "BGHTP",
    rating: "3.0",
    reviewCount: "5",
    price: "$12.99",
  },
];

let context: BrowserContext;

test.beforeAll(async () => {
  // Launch Chromium with the extension loaded
  context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--disable-gpu",
    ],
  });
});

test.afterAll(async () => {
  await context?.close();
});

/**
 * Navigate to a mock Amazon search page.
 * Uses a data URL with Amazon-like URL to trigger the content script.
 * Since content scripts only run on real Amazon URLs, we test with
 * route interception.
 */
async function navigateToMockSearch(page: Page): Promise<void> {
  const html = buildMockAmazonSearchPage(MOCK_PRODUCTS);

  // Intercept the Amazon URL and serve our mock HTML
  await page.route("https://www.amazon.com/s*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: html,
    });
  });

  await page.goto("https://www.amazon.com/s?k=headphones", {
    waitUntil: "domcontentloaded",
  });

  // Wait for the extension to inject its filter bar
  await page.waitForSelector("#bas-filter-bar-host", { timeout: 5000 });
}

test.describe("Settings Persistence", () => {
  test("filter bar is injected on Amazon search pages", async () => {
    const page = await context.newPage();
    await navigateToMockSearch(page);

    const filterBar = page.locator("#bas-filter-bar-host");
    await expect(filterBar).toBeVisible();
    await page.close();
  });

  test("filter settings persist across page navigations", async () => {
    const page = await context.newPage();
    await navigateToMockSearch(page);

    // Set min reviews to 500 via Shadow DOM
    await page.evaluate(() => {
      const host = document.querySelector("#bas-filter-bar-host");
      const input = host?.shadowRoot?.querySelector<HTMLInputElement>("input[type='number'][max='50000']");
      if (input) {
        input.value = "500";
        input.dispatchEvent(new Event("change"));
      }
    });

    // Wait for debounced save (300ms + buffer)
    await page.waitForTimeout(500);

    // Navigate to a new search (simulates clicking page 2)
    await page.goto("https://www.amazon.com/s?k=headphones&page=2", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#bas-filter-bar-host", { timeout: 5000 });

    // Check that min reviews is still 500
    const value = await page.evaluate(() => {
      const host = document.querySelector("#bas-filter-bar-host");
      const input = host?.shadowRoot?.querySelector<HTMLInputElement>("input[type='number'][max='50000']");
      return input?.value ?? "";
    });
    expect(value).toBe("500");

    await page.close();
  });

  test("hide sponsored checkbox persists", async () => {
    const page = await context.newPage();
    await navigateToMockSearch(page);

    // Check the hide sponsored checkbox via Shadow DOM
    await page.evaluate(() => {
      const host = document.querySelector("#bas-filter-bar-host");
      const checkboxes = host?.shadowRoot?.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
      // First checkbox is Hide Sponsored
      const cb = checkboxes?.[0];
      if (cb) {
        cb.checked = true;
        cb.dispatchEvent(new Event("change"));
      }
    });

    // Wait for save
    await page.waitForTimeout(500);

    // Reload the page
    await page.goto("https://www.amazon.com/s?k=headphones&page=3", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#bas-filter-bar-host", { timeout: 5000 });

    // Check that checkbox is still checked
    const isChecked = await page.evaluate(() => {
      const host = document.querySelector("#bas-filter-bar-host");
      const checkboxes = host?.shadowRoot?.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
      return checkboxes?.[0]?.checked ?? false;
    });
    expect(isChecked).toBe(true);

    await page.close();
  });

  test("exclude keywords persist across navigations", async () => {
    const page = await context.newPage();
    await navigateToMockSearch(page);

    // Enter exclude keywords via Shadow DOM
    await page.evaluate(() => {
      const host = document.querySelector("#bas-filter-bar-host");
      const textarea = host?.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea");
      if (textarea) {
        textarea.value = "refurbished, 45W";
        textarea.dispatchEvent(new Event("change"));
      }
    });

    await page.waitForTimeout(500);

    // Navigate away and back
    await page.goto("https://www.amazon.com/s?k=earbuds", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#bas-filter-bar-host", { timeout: 5000 });

    // Verify keywords persisted
    const value = await page.evaluate(() => {
      const host = document.querySelector("#bas-filter-bar-host");
      const textarea = host?.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea");
      return textarea?.value ?? "";
    });
    expect(value).toContain("refurbished");
    expect(value).toContain("45W");

    await page.close();
  });

  test("settings persist in a new tab", async () => {
    // Set filters in tab 1
    const page1 = await context.newPage();
    await navigateToMockSearch(page1);

    await page1.evaluate(() => {
      const host = document.querySelector("#bas-filter-bar-host");
      const input = host?.shadowRoot?.querySelector<HTMLInputElement>("input[type='number'][max='50000']");
      if (input) {
        input.value = "1000";
        input.dispatchEvent(new Event("change"));
      }
    });
    await page1.waitForTimeout(500);

    // Open a new tab
    const page2 = await context.newPage();
    await navigateToMockSearch(page2);

    // Verify the settings carried over
    const value = await page2.evaluate(() => {
      const host = document.querySelector("#bas-filter-bar-host");
      const input = host?.shadowRoot?.querySelector<HTMLInputElement>("input[type='number'][max='50000']");
      return input?.value ?? "";
    });
    expect(value).toBe("1000");

    await page1.close();
    await page2.close();
  });

  test("filtered products are hidden based on persisted settings", async () => {
    const page = await context.newPage();
    await navigateToMockSearch(page);

    // Set min reviews = 100 (should hide products with <100 reviews)
    await page.evaluate(() => {
      const host = document.querySelector("#bas-filter-bar-host");
      const input = host?.shadowRoot?.querySelector<HTMLInputElement>("input[type='number'][max='50000']");
      if (input) {
        input.value = "100";
        input.dispatchEvent(new Event("change"));
      }
    });

    // Wait for filters to apply
    await page.waitForTimeout(500);

    // Products with <100 reviews should be hidden
    const { hiddenCount, visibleCount } = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
      let hidden = 0;
      let visible = 0;
      cards.forEach((card) => {
        const el = card as HTMLElement;
        if (el.style.display === "none" || el.classList.contains("bas-hidden")) {
          hidden++;
        } else {
          visible++;
        }
      });
      return { hiddenCount: hidden, visibleCount: visible };
    });

    expect(hiddenCount).toBeGreaterThanOrEqual(2); // At least the two low-review products
    expect(visibleCount).toBeGreaterThanOrEqual(3); // Sony, Bose, Apple

    await page.close();
  });

  test("CCC button opens CamelCamelCamel in new tab", async () => {
    const page = await context.newPage();
    await navigateToMockSearch(page);

    // Wait for card actions to be injected
    await page.waitForTimeout(500);

    // Find and click the first CCC button
    const cccButton = page.locator(".bas-card-actions button").filter({ hasText: "CCC" }).first();

    // Listen for new page (popup/tab)
    const [newPage] = await Promise.all([
      context.waitForEvent("page"),
      cccButton.click(),
    ]);

    // Verify the URL points to CamelCamelCamel
    expect(newPage.url()).toContain("camelcamelcamel.com");

    await newPage.close();
    await page.close();
  });
});
