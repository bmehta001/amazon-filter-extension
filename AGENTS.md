# AGENTS.md

> Context for AI agents (Copilot, Claude, Codex) working in this codebase.

## Project Overview

**Better Amazon Search** is a Manifest V3 browser extension that enhances Amazon search results with advanced filtering, review analysis, deal scoring, price tracking, and product comparison. It runs 100% client-side with zero external data collection.

**Target users:** Amazon shoppers who want to cut through fake reviews, find real deals, and compare products without switching tabs.

**Business model:** Freemium — core filters are free, advanced features (review forensics, compare tray, export, etc.) require a Pro license. Features roll out in 8 waves via `src/releaseSchedule.ts`.

## Architecture

```
Content Script (src/content/index.ts)
  ├── Extracts product data from Amazon DOM
  ├── Applies filters, scoring, and enrichment
  ├── Injects UI: filter bar (Shadow DOM) + badges (direct injection)
  └── Communicates with service worker via chrome.runtime.sendMessage

Service Worker (src/background/service_worker.ts)
  ├── Schedules alarms (watchlist checks, allowlist refresh)
  ├── Fetches CPSC recall data (cross-origin requires background)
  ├── Manages declarativeContent rules (Chrome/Edge only)
  └── Opens onboarding page on first install

Popup (src/popup/)
  └── Toolbar popup for quick settings access

Onboarding (src/onboarding/)
  └── First-install welcome flow with feature tour
```

### Content Script Injection Model

- **Filter bar** and **sidebar widgets** use **Shadow DOM** (`attachShadow({ mode: "open" })`) for style isolation from Amazon's CSS. See `src/content/ui/filterBar.ts` and `src/content/ui/sidebarWidgets.ts`.
- **Product badges** (review, deal, recall, trust, seller, confidence, duplicate, listing quality, savings) inject directly into Amazon's DOM alongside each product card.
- **Compare tray** uses Shadow DOM. See `src/content/ui/compareTray.ts`.
- Global styles are concatenated in `src/content/index.ts` as `GLOBAL_STYLES` and injected once.

## Directory Structure

```
src/
├── background/service_worker.ts     # MV3 service worker
├── content/
│   ├── index.ts                     # Content script entry point (main orchestrator)
│   ├── extractor.ts                 # Product data extraction from Amazon DOM
│   ├── haulExtractor.ts             # Extraction for Amazon Haul pages
│   ├── filters.ts                   # Filter logic (min reviews, price, brand, etc.)
│   ├── sorting.ts                   # Sort override logic
│   ├── dealScoring.ts               # Multi-factor deal scoring
│   ├── dedup.ts                     # Duplicate product detection
│   ├── crossListingDedup.ts         # Cross-listing duplicate detection
│   ├── observer.ts                  # MutationObserver for dynamic page updates
│   ├── paginator.ts                 # Auto-pagination across search pages
│   ├── export.ts                    # CSV/JSON/clipboard export
│   └── ui/                          # All injected UI components
│       ├── filterBar.ts + .css      # Main filter bar (Shadow DOM)
│       ├── sidebarWidgets.ts + .css # Distributed filter widgets in sidebar
│       ├── designTokens.ts          # Centralized colors, radii, fonts, spacing
│       ├── reviewBadge.ts           # Review trust score badge
│       ├── dealBadge.ts             # Deal quality badge
│       ├── recallBadge.ts           # CPSC recall warning badge
│       ├── trustBadge.ts            # Composite trust badge
│       ├── sellerBadge.ts           # Seller trust badge
│       ├── confidenceBadge.ts       # Confidence indicator
│       ├── duplicateBadge.ts        # Duplicate listing marker
│       ├── listingQualityBadge.ts   # Listing completeness badge
│       ├── savingsBadge.ts          # Stacked savings breakdown
│       ├── productScore.ts          # Composite product score
│       ├── priceSparkline.ts        # CCC price history sparkline
│       ├── priceIntel.ts            # Historical price context
│       ├── reviewInsights.ts        # Category-level review analysis
│       ├── reviewSummaryPanel.ts    # AI-generated review summary
│       ├── reviewGallery.ts         # Media-rich review browser
│       ├── unifiedReviews.ts        # Aggregated review data view
│       ├── radarChart.ts            # Radar chart for category scores
│       ├── compareTray.ts           # Side-by-side comparison (Shadow DOM)
│       ├── alternatives.ts          # Similar product suggestions
│       ├── advancedSearch.ts        # Visual query builder
│       ├── cardActions.ts           # Per-card action buttons
│       ├── transparencyTooltip.ts   # Filter/flag reasoning tooltip
│       ├── featureTour.ts           # First-use feature walkthrough
│       └── upgradePrompt.ts         # Pro upgrade prompts
├── review/
│   ├── analyzer.ts                  # Review score computation (standard + ML)
│   ├── fetcher.ts                   # Rate-limited review page fetcher
│   ├── trustScore.ts                # Composite 0-100 trust score calculator
│   ├── trustSignals.ts              # Individual trust signal detectors
│   ├── mlSentiment.ts               # ML-based sentiment analysis
│   ├── categories.ts                # Review category classification
│   ├── categoryWeights.ts           # Department-aware category weighting
│   ├── summary.ts                   # Review summary generation
│   ├── cache.ts                     # Review score cache
│   └── types.ts                     # Review type definitions
├── brand/
│   ├── fetcher.ts                   # Rate-limited brand detail fetcher
│   ├── scoring.ts                   # Brand trust scoring
│   ├── allowlist.ts                 # Brand allowlist/blocklist management
│   ├── learning.ts                  # Learned brand reputation over time
│   ├── cache.ts                     # Brand data cache
│   └── brands.txt                   # Known brand list
├── seller/
│   ├── trust.ts                     # Seller trust scoring
│   └── listingSignals.ts            # Listing integrity analysis
├── listing/completeness.ts          # Listing completeness scoring
├── recall/
│   ├── checker.ts                   # CPSC recall matching logic
│   └── types.ts                     # Recall type definitions
├── watchlist/
│   ├── storage.ts                   # Watchlist persistence
│   └── checker.ts                   # Price-drop detection
├── shortlist/storage.ts             # Shortlist persistence
├── compare/storage.ts               # Compare tray state
├── insights/
│   ├── dashboard.ts                 # Usage analytics (local only)
│   └── usageTracker.ts              # Session tracking
├── journal/purchaseJournal.ts       # Personal product research notes
├── gift/giftPlan.ts                 # Gift planner
├── reseller/tools.ts                # Margin/ROI calculators
├── locale/pricePeek.ts              # Cross-region price comparison
├── licensing/
│   ├── license.ts                   # License state (free | pro) via chrome.storage.sync
│   └── featureGate.ts               # Feature availability checks by tier
├── popup/                           # Extension popup (HTML + CSS + TS)
├── onboarding/                      # First-install onboarding (HTML + CSS + TS)
├── util/
│   ├── enrichmentCache.ts           # Enrichment cache (chrome.storage.session)
│   ├── storage.ts                   # Filter/preference persistence (chrome.storage.sync)
│   ├── debounce.ts                  # Debounce utility
│   ├── network.ts                   # Network usage resolution
│   ├── parse.ts                     # HTML/text parsing helpers
│   ├── url.ts                       # Amazon URL utilities
│   └── amazonParams.ts              # Amazon URL parameter parsing
├── selectors.ts                     # Amazon DOM selector registry + remote override
├── releaseSchedule.ts               # 8-wave feature rollout control
├── types.ts                         # Shared type definitions (FilterState, Product, etc.)
└── vite-env.d.ts                    # Vite type declarations
```

## Build & Test

```bash
npm install                   # Install dependencies
npm run dev                   # Vite dev server with HMR
npm run build                 # tsc --noEmit && vite build → dist/
npm test                      # Vitest unit tests (1,139 tests, 58 files)
npm run test:watch            # Vitest in watch mode
npm run test:e2e              # Playwright E2E (headed Chrome, loads extension)
npm run test:coverage         # Vitest with V8 coverage
```

- **Unit tests** run in jsdom via Vitest. Config: `vitest.config.ts`.
- **E2E tests** run in headed Chromium via Playwright. Config: `playwright.config.ts`. Tests are in `tests/e2e/`.
- **Coverage thresholds**: 55% statements, 50% branches, 55% functions, 55% lines.

## Key Systems

### Selector System (`src/selectors.ts`)

Amazon changes their DOM frequently. All CSS selectors are centralized in `src/selectors.ts` with cascading fallbacks — each selector group is an array tried in order until one matches.

**Remote override:** On init, the extension fetches `https://betteramazonsearch.com/selectors.json` and caches it in `chrome.storage.local` with a 1-hour TTL. This allows hot-fixing broken selectors without waiting 1–3 days for Chrome Web Store review. If the fetch fails, built-in selectors are used.

### Feature Gating (`src/licensing/` + `src/releaseSchedule.ts`)

Two independent gates control feature availability:

1. **License tier** (`src/licensing/license.ts` + `featureGate.ts`) — `"free"` or `"pro"`. Stored in `chrome.storage.sync`. `isFeatureAvailable(featureId, tier)` checks the tier map.

2. **Release wave** (`src/releaseSchedule.ts`) — 8-wave progressive rollout. `isReleased(featureId)` checks if `CURRENT_WAVE >= WAVE_MAP[featureId]`. To roll out the next wave, increment `CURRENT_WAVE` and publish an update.

Both gates must pass for a feature to be active. Usage in content script:
```ts
if (isReleased("deal-scoring") && isFeatureAvailable("deal-scoring", license)) {
  // enable deal scoring
}
```

### Design Tokens (`src/content/ui/designTokens.ts`)

All UI components reference centralized tokens for colors, border radii, typography, and spacing. Tokens are injected as CSS custom properties via `DESIGN_TOKEN_STYLES` in the global stylesheet. When changing visual style, update tokens here — not in individual components.

Key token groups: `COLORS`, `RADII`, `FONT`.

### Enrichment Cache (`src/util/enrichmentCache.ts`)

Product analysis data (review scores, brand info, deal scores) is cached in **`chrome.storage.session`** — NOT `sessionStorage`. This is a deliberate security decision: `sessionStorage` is accessible to Amazon's own JavaScript, which could read our analysis data. `chrome.storage.session` is extension-only.

Cache keys are prefixed. Data persists for the browser session and is cleared on restart.

### Storage Writes (`src/util/storage.ts`)

Filter and preference writes use a **debounced save pattern** (300ms debounce) to avoid hammering `chrome.storage.sync` with rapid changes. A `syncFlushPendingFilterSave()` function exists for immediate flush before navigation.

### Rate-Limited Fetchers

Both `src/review/fetcher.ts` and `src/brand/fetcher.ts` implement rate-limited fetching via `createRateLimitedFetcher()` and `createRateLimitedDetailFetcher()`. These throttle requests to Amazon product/review pages to avoid triggering bot detection. The watchlist checker (`src/watchlist/checker.ts`) also uses rate-limited patterns.

### Amazon Domain Support

The extension supports 10 Amazon locales:
- `.com`, `.co.uk`, `.ca`, `.de`, `.fr`, `.it`, `.es`, `.in`, `.co.jp`, `.com.au`

Content scripts run on both `/s` (search) and `/haul` (Amazon Haul discount store) pages. URL utilities are in `src/util/url.ts`.

## Decisions Made (Do Not Relitigate)

- **Shadow DOM for filter bar, direct injection for badges.** The filter bar needs style isolation from Amazon's CSS. Badges are small enough that isolation isn't worth the complexity.
- **`chrome.storage.session` over `sessionStorage`.** Security: Amazon's JS can read `sessionStorage` but not `chrome.storage.session`.
- **Centralized selector registry with remote override.** Amazon's DOM changes frequently. One file to update + remote hot-fix capability avoids multi-day CWS review delays.
- **8-wave release schedule.** Marketing strategy: each wave generates a CWS "updated" signal for ranking boost, creates distinct launch moments, and avoids overwhelming new users.
- **jsdom for unit tests.** Tests need DOM APIs but don't need a real browser. jsdom is 10× faster than Playwright for unit tests. E2E tests cover real-browser scenarios.
- **Debounced storage writes.** `chrome.storage.sync` has write-rate limits. Debouncing prevents `QUOTA_BYTES_PER_ITEM` errors during rapid filter changes.

## Custom Agents (`.github/agents/`)

This repository includes 11 specialized AI agents:

| Agent | File | Purpose |
|-------|------|---------|
| Agent Strategist | `agent-strategist.agent.md` | Optimize agent ecosystem, create new agents |
| Brand Marketing | `brand-marketing.agent.md` | Messaging, launch planning, community building |
| Code Cleanup | `code-cleanup.agent.md` | Dead code removal, hygiene, housekeeping |
| Extension Store Optimizer | `extension-store-optimizer.agent.md` | CWS/Edge/AMO store listings |
| Finance Analyst | `finance-analyst.agent.md` | Unit economics, pricing, revenue modeling |
| Product Strategist | `product-strategist.agent.md` | Monetization, positioning, business model |
| Sales & Growth | `sales-growth.agent.md` | GTM strategy, PLG vs sales-led, funnels |
| Security Auditor | `security-auditor.agent.md` | Vulnerability assessment, code hardening |
| Software Architect | `software-architect.agent.md` | Architecture decisions, trade-offs, system design |
| Technical Writer | `technical-writer.agent.md` | Documentation, READMEs, changelogs |
| UI Design Architect | `ui-design-architect.agent.md` | Interface design, UX review, design systems |

## Configuration Files

| File | Purpose |
|------|---------|
| `manifest.config.ts` | Chrome extension manifest (MV3) via `@crxjs/vite-plugin` |
| `vite.config.ts` | Vite build config with CRXJS plugin |
| `vitest.config.ts` | Unit test config (jsdom, V8 coverage, thresholds) |
| `playwright.config.ts` | E2E test config (headed Chromium) |
| `tsconfig.json` | TypeScript config (ES2020, strict, bundler resolution) |
| `BROWSER_COMPATIBILITY.md` | Full browser support matrix and risk analysis |
