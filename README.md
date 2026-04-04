# Better Amazon Search

**Shop smarter on Amazon — detect fake reviews, score deals, track prices, and compare products with AI-powered analysis.**

> 100% client-side. Zero data collection. No external servers (except CPSC recall lookups). Your shopping data never leaves your browser.

<!-- TODO: Add hero screenshot
![Better Amazon Search in action](docs/screenshots/hero.png)
-->

## Features

### 🔍 Smart Filtering & Search

- **Advanced filters** — filter by minimum reviews, star rating, price range, and Prime eligibility
- **Keyword exclusion** — hide results containing specific terms
- **Hide sponsored results** — one click to remove all ads
- **Auto-pagination** — load more results without clicking "Next"
- **Sort override** — sort results by review score, deal value, trust level, and more
- **Advanced search builder** — construct complex Amazon queries visually
- **Duplicate detection** — cross-listing dedup identifies the same product sold under different names

### ⭐ Review Analysis

- **Review trust scoring** — 0–100 composite score detects fake/incentivized reviews
- **ML sentiment analysis** — category-level review breakdown (build quality, value, durability, etc.)
- **Review forensics** — signals like review clustering, unverified purchase ratio, and rating/text mismatch
- **Review summary panel** — AI-generated summary of what reviewers actually say
- **Review gallery** — media-rich review browser with photos and videos
- **Unified review view** — aggregated review data at a glance

### 🏷️ Deal & Price Intelligence

- **Deal scoring** — rates every deal on a multi-factor scale (discount depth, price history, category norms)
- **Savings breakdown** — stacked savings from coupons, Subscribe & Save, multi-buy, and more
- **Price sparklines** — inline CamelCamelCamel price history charts
- **Cross-locale price peek** — compare prices across Amazon regions (US, UK, DE, JP, etc.)
- **Price intel panel** — historical price context per product

### 🛡️ Trust & Safety

- **Brand trust scoring** — learned brand reputation with allowlist/blocklist
- **Seller trust analysis** — evaluates seller metrics, listing signals, and marketplace risk
- **Listing quality audit** — completeness scoring for product pages
- **Product safety recalls** — live CPSC recall database matching
- **Confidence badge** — at-a-glance composite trust indicator
- **Transparency tooltips** — see exactly why a product was filtered, flagged, or boosted

### 📊 Research & Comparison

- **Compare tray** — side-by-side product comparison (up to 4 items)
- **Alternatives finder** — surfaces similar products you might have missed
- **Shortlists** — save and organize products for later
- **Watchlist with price alerts** — track products and get notified on price drops
- **Export** — download results as CSV, JSON, or copy to clipboard

### 📈 Shopping Intelligence

- **Insights dashboard** — tracks your analysis activity (products scanned, suspicious listings found, savings detected)
- **Purchase journal** — personal product research notes
- **Gift planner** — organize gift ideas by recipient
- **Reseller tools** — margin and ROI calculators for resellers

<!-- TODO: Add feature screenshots
### Screenshots

| Filter Bar | Review Analysis | Deal Scoring |
|:---:|:---:|:---:|
| ![Filters](docs/screenshots/filters.png) | ![Reviews](docs/screenshots/reviews.png) | ![Deals](docs/screenshots/deals.png) |
-->

## Installation

### Chrome Web Store (recommended)

<!-- TODO: Add Chrome Web Store link once published -->

1. Visit the [Chrome Web Store listing](#)
2. Click **Add to Chrome**
3. Navigate to any [Amazon search page](https://www.amazon.com/s?k=headphones) — the filter bar appears automatically

### Manual / Development Install

```bash
git clone https://github.com/your-username/amazon-filter-extension.git
cd amazon-filter-extension
npm install
npm run dev
```

Then load the unpacked extension:

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

The extension hot-reloads during development — save a file and the extension updates automatically.

## Development

### Prerequisites

- **Node.js** 18+
- **npm** 9+
- **Chrome** 105+ (for testing)

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | Type-check with `tsc` and build for production |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:e2e` | Run end-to-end tests (Playwright, headed Chrome) |
| `npm run test:coverage` | Run tests with V8 coverage report |

### Test Suite

- **1,139 tests** across **58 test files**
- Unit tests use **Vitest** with jsdom environment
- E2E tests use **Playwright** with a real Chrome instance (extensions require headed mode)
- Coverage thresholds: 55% statements, 50% branches, 55% functions, 55% lines

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (ES2020, strict mode) |
| Bundler | Vite + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin) |
| Extension API | Chrome Extensions Manifest V3 |
| Unit Testing | Vitest + jsdom |
| E2E Testing | Playwright |
| Coverage | V8 provider via Vitest |

## Architecture

```
┌──────────────┐    message passing    ┌────────────────────┐
│   Popup UI   │ ◄──────────────────►  │  Service Worker    │
│  popup.html  │                       │  (background)      │
└──────────────┘                       │  - alarm scheduling│
                                       │  - allowlist refresh│
       ▲                               │  - recall fetching │
       │                               └────────────────────┘
       │ chrome.storage
       │                               ┌────────────────────┐
       ▼                               │  Onboarding        │
┌──────────────────────────────────┐    │  onboarding.html   │
│         Content Script           │    └────────────────────┘
│  (injected on Amazon /s pages)   │
│                                  │
│  ┌──────────┐  ┌──────────────┐  │
│  │Filter Bar│  │Product Badges│  │
│  │(Shadow   │  │(direct DOM   │  │
│  │ DOM)     │  │ injection)   │  │
│  └──────────┘  └──────────────┘  │
└──────────────────────────────────┘
```

- **Content script** (`src/content/index.ts`) — main entry point, injected on Amazon search and Haul pages
- **Service worker** (`src/background/service_worker.ts`) — handles alarms, recall API calls, and declarativeContent
- **Popup** (`src/popup/`) — extension toolbar popup for quick settings
- **Onboarding** (`src/onboarding/`) — first-install welcome flow with feature tour

## Browser Support

| Browser | Min Version | Install Source |
|---------|-------------|----------------|
| Chrome | 105+ | Chrome Web Store |
| Edge | 105+ | Edge Add-ons / Chrome Web Store |
| Firefox | 121+ | Firefox AMO |
| Brave | 105+ | Chrome Web Store |
| Opera | 91+ | Chrome Web Store |
| Vivaldi | 105+ | Chrome Web Store |
| Arc | 105+ | Chrome Web Store |

Minimum versions are set by CSS `:has()` (Chrome 105+) and MV3 service workers (Firefox 121+). See [BROWSER_COMPATIBILITY.md](BROWSER_COMPATIBILITY.md) for the full compatibility matrix and risk analysis.

## Privacy

- **100% client-side analysis** — all review scoring, deal analysis, and filtering runs in your browser
- **Zero data collection** — no analytics, no telemetry, no user tracking
- **No external servers** — the only network call is to the [CPSC SaferProducts.gov API](https://www.saferproducts.gov/) for product recall checks
- **Isolated storage** — enrichment cache uses `chrome.storage.session` (not `sessionStorage`) so Amazon's JavaScript cannot read your analysis data
- **No remotely hosted code** — everything is bundled in the extension

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Submit a pull request

Please ensure:
- All existing tests pass
- New features include corresponding tests
- TypeScript compiles without errors (`tsc --noEmit`)

## License

<!-- TODO: Add license -->
TBD
