# Decision Notes

WHY behind every major design decision, trade-off, and tool choice.

---

## Table of Contents
1. [Architecture: 100% Client-Side](#1-architecture-100-client-side)
2. [Storage: sessionStorage → chrome.storage.session](#2-storage-migration)
3. [UI: Badge Consolidation (10 → 3)](#3-badge-consolidation)
4. [Monetization: Freemium with Annual Subscription](#4-freemium-model)
5. [Feature Gating: Client-Side Only (Phase 1)](#5-client-side-gating)
6. [Selector Resilience: Centralized Registry + Remote Override](#6-selector-resilience)
7. [Release Strategy: 8-Wave Trickle Rollout](#7-release-waves)
8. [Crowd Cache: EMA Consensus + Shadowbanning](#8-crowd-cache-design)
9. [Seller Fairness: New Product Detector](#9-seller-fairness)
10. [Backend: Cloudflare Workers + D1](#10-backend-stack)
11. [Industry Comparison](#11-industry-comparison)
12. [Privacy Language: Honest About External Requests](#12-privacy-language)
13. [Time Saved Metric: Products-Based Estimation](#13-time-saved-metric)
14. [Crowd Cache Gating: Login Required](#14-crowd-cache-gating)

---

## 1. Architecture: 100% Client-Side

**Decision**: All analysis (review scoring, trust signals, deal scoring, ML sentiment) runs in the user's browser. No server required.

**Why**: 
- Fakespot died because server-side analysis was expensive to operate and Amazon gated reviews behind login (Nov 2024). Our content script runs as the logged-in user — we see all reviews.
- $0 marginal cost per user = 95% gross margin = bootstrapper's dream.
- Privacy positioning: "Your data never leaves your browser" is a genuine differentiator post-Fakespot.

**Trade-offs**:
- Slower than server-side (must fetch product pages one at a time from user's browser)
- Can't do cross-user analysis without a backend (planned for Phase 3)
- ML model runs on user's device (larger bundle size)

**What competitors do**: Keepa and ReviewMeta use server-side backends. This gives them speed but creates infrastructure costs and privacy concerns. CamelCamelCamel is entirely server-side. Honey was client-side for coupon detection but server-side for deal comparison.

**Mitigation for speed**: Crowdsourced cache (Phase 3) will serve pre-computed results from other users, making popular products instant.

---

## 2. Storage: sessionStorage → chrome.storage.session

**Decision**: Enrichment cache uses `chrome.storage.session` instead of `sessionStorage`.

**Why**: sessionStorage on Amazon's origin is readable by Amazon's own JavaScript. Our cached trust scores, brand preferences, and research patterns were exposed to any script on the page. `chrome.storage.session` is isolated to the extension.

**Discovered**: Security audit (April 2026). Fixed in `d3f48d6`.

**Trade-off**: `chrome.storage.session` is async (requires preloading), while `sessionStorage` was sync. Added `preloadSessionCache()` bridge pattern.

**Learning**: Never use `sessionStorage` or `localStorage` for extension data that should be private from the host page. Content scripts share the page's storage origin.

---

## 3. Badge Consolidation (10 → 3)

**Decision**: Collapsed 10 independent badges into 3 visual zones: ProductScore, PriceIntel, UnifiedReviews.

**Why (UI design audit)**:
- 14 elements per card caused "density crisis" — users thought about the extension instead of shopping (Krug: "Don't make me think")
- Confidence badge duplicated the badges it summarized (same signal shown twice in different visual vocabularies)
- 6 action buttons per card was toolbar-level complexity

**What we kept**: All information is still accessible — just reorganized into progressive disclosure. ProductScore badge expands to show all constituent scores. PriceIntel merges deal + savings + sparkline into one line.

**What we lost (intentionally)**: Radar chart (replaced by topic bars), representative review quotes (density reduction), standalone gallery lightbox (thumbnails inline in unified section).

**Principle**: Tufte's data-ink ratio — maximize data, minimize ink. Dieter Rams: "Less but better."

---

## 4. Freemium with Annual Subscription

**Decision**: Free tier (basic filters, simple review grade) + Pro ($4.99/mo, $39.99/yr).

**Why**:
- McKenzie: "Charge more" — $29/yr was considered but strategist recommended $39.99 for 29% more revenue at same conversion.
- Fried/Levels: Free tier is the distribution engine (installs, reviews, word-of-mouth). Pro is the revenue engine.
- One-time purchase rejected: caps revenue, no recurring staircase.
- Monthly-only rejected: browser extension churn is brutal at monthly billing.

**The split logic**: Free must be genuinely useful (drives 5-star reviews) but visibly incomplete (drives upgrade curiosity). "Pro Would Have Caught This" teasers create loss aversion.

**What competitors charge**: Keepa: $2/mo for charts. Honey: free (affiliate revenue). ReviewMeta: free. This positions us at the premium end but with far more features.

**Pricing justification**: Average Amazon household spends $2K/yr. 5-10% wasted on bad purchases = $100-200/yr lost. $39.99/yr to prevent that is a 5:1 value ratio.

---

## 5. Client-Side Feature Gating (Phase 1)

**Decision**: Feature gating is client-side only via `chrome.storage.sync`. No server validation.

**Why**: We have no backend yet and no users. Building server-side license validation before revenue validation is premature (YAGNI). ExtensionPay or LemonSqueezy will handle server-side validation when we're ready.

**Trade-off**: Anyone can set `tier: "pro"` in DevTools. This is intentional — at 0 users, piracy prevention is not worth the engineering cost. Keepa and ReviewMeta have similar client-side gating.

**When to upgrade**: Phase 3 (500+ users), when backend exists. Server-side JWT validation with periodic re-verification.

---

## 6. Selector Resilience: Centralized Registry + Remote Override

**Decision**: All Amazon DOM selectors centralized in `src/selectors.ts` with cascading fallbacks, remote JSON override, and fallback tracking.

**Why (Red Team Analysis)**:
- Amazon changes DOM monthly via A/B tests
- Chrome Web Store review takes 1-3 days — too slow for selector fixes
- Remote override bypasses CWS entirely: update a JSON file → all users get fix within 1 hour
- Fallback tracking detects degradation before total breakage

**Three-layer defense**:
1. **Primary selector** → works normally
2. **Fallback selectors** → kick in if primary fails (tracked via `getFallbackStats()`)
3. **Remote override** → fetched from hosted JSON, prepended to selector arrays

**What competitors do**: Keepa likely has a similar problem but with a server-side approach (they can re-scrape). Extensions without centralized selectors (like early Fakespot) were brittle.

**Learning**: The response time gap (Amazon changes in hours, CWS review in days) is the single biggest operational risk for any Amazon extension. Remote config is the industry solution (uBlock Origin uses remote filter lists for the same reason).

---

## 7. Release Strategy: 8-Wave Trickle Rollout

**Decision**: Ship all features but enable them in 8 weekly waves via `src/releaseSchedule.ts`.

**Why**:
- Each wave = a Chrome Web Store "updated" signal (ranking boost)
- Each wave = a marketing moment (blog post, Reddit thread)
- Users can't absorb 20 features at once (overwhelm → uninstall)
- Measurable: per-wave attribution shows which features drive installs/upgrades

**Implementation**: `CURRENT_WAVE` constant. Change from N to N+1 and push. `isReleased(feature)` checks gate activation.

---

## 8. Crowd Cache: EMA Consensus + Shadowbanning

**Decision**: Crowdsourced analysis cache using Exponential Moving Average with anomaly gating.

**Why**:
- User A analyzes product X → results cached → User B gets instant results (no fetching/ML needed)
- Amazon blocks server-side scraping, but users' browsers are the scraping fleet
- EMA with α=0.3 limits single-contribution damage to ±9 points
- Shadowbanning via weight reduction (0.1×) is silent and industry-standard

**What to cache**: Review scores, trust scores, summaries, BSR, brand, origin (stable, expensive to compute).
**What NOT to cache**: Seller info (buy-box rotates per user), deal scores (prices change hourly), raw review text (privacy).

**Auth decision**: Don't require login to contribute — kills contribution volume. Use contributor reputation scoring instead.

**Full design**: 45KB architecture doc in `files/crowdsourced-cache-design.txt`.

---

## 9. Seller Fairness: New Product Detector

**Decision**: Suppress numeric trust scores for new products. Show "🆕 New Product — Limited data available" instead.

**Why**: A legitimate product with 8 reviews scores ~55-65 ("mixed") because 5+ signals penalize data absence, not fraud. Penalizing newness conflates "unknown" with "suspicious."

**Detection heuristic**: `totalRatings < 25 AND review span < 60 days`

**Signal classification**:
- Hard fraud signals (copy-paste, sentiment mismatch): apply always
- Statistical signals (distribution skew): require ≥30 reviews
- Contextual signals (verified ratio): require ≥20 reviews

**Principle**: Proportional evidence — warning strength should match evidence strength.

**Not yet implemented** — planned for next sprint.

---

## 10. Backend: Cloudflare Workers + D1

**Decision**: Separate repo (`amazon-filter-backend/`) using Cloudflare Workers + D1 (SQLite).

**Why**:
- Workers free tier: 100K requests/day (handles 3K+ DAU at $0)
- D1: SQLite-compatible, 5M reads/day free
- No cold-start servers to manage, no Docker, no Kubernetes
- Total cost at 1K paying users: $0-5/month

**What it handles**: Auth (magic links), encrypted sync, crowdsourced cache (EMA consensus), license validation (LemonSqueezy webhooks), health monitoring.

**Architecture**: Flat router (9 routes, no framework), zero runtime deps, <5ms cold start. Session tokens in D1 (revocable, not JWTs).

---

## 11. Industry Comparison

*See competitor research table below — updated from web research.*

### Data Architecture Comparison

| Extension | Client-Side | Server-Side | Backend Cost | Installs | Rating |
|-----------|-------------|-------------|-------------|----------|--------|
| **Better Amazon Search** | ✅ All analysis | Planned (crowd cache) | $0 today | Pre-launch | N/A |
| **Keepa** | Price display + iframe | ✅ Price history DB (keepa.com) | High (massive DB) | 4,000,000 | 4.7★ |
| **ReviewMeta** | Display only | ✅ Review analysis (web app) | Medium | ~15,000 (Edge) | 3.1★ |
| **CamelCamelCamel** | Popup only (no content script) | ✅ Price tracking | Medium | 800,000 | 4.3★ |
| **Honey** | Coupon injection (broad host access) | ✅ Coupon DB + deal comparison | Very high (PayPal) | 13,000,000 | 4.6★ |
| **RateBud** | Trust badge display | ✅ API at ratebud.ai | Low | 1,000 | 4.3★ |

### Freemium Model Comparison

| Extension | Free Tier | Paid Tier | Price |
|-----------|-----------|-----------|-------|
| **Better Amazon Search** | Filters, simple review grade | ML analysis, deal scoring, watchlist, export, etc. | $4.99/mo, $39.99/yr |
| **Keepa** | Basic price chart | Full history, API, data export | **~€19/mo** (~$21/mo) |
| **ReviewMeta** | Full analysis | N/A (fully free) | Free |
| **CamelCamelCamel** | Full tracking | N/A (fully free) | Free (ad-supported) |
| **Honey** | Full features | N/A (affiliate-funded) | Free (collects user data) |
| **RateBud** | Full grades | N/A (no paid tier found) | Free |

### Privacy Comparison

| Extension | Data Collection | Permissions | User Tracking |
|-----------|----------------|-------------|---------------|
| **Better Amazon Search** | None (local only) | storage, alarms, notifications, declarativeContent | None |
| **Keepa** | Price data to keepa.com | +cookies, webRequest, offscreen, contextMenus | Anonymous price observations |
| **ReviewMeta** | URL/ASIN to server | Unclear from CWS listing | IP + ASIN logged |
| **Honey** | **PII, payment info, location, web history, user activity** | Broad http/https, cookies, webRequest, unlimitedStorage | Google Analytics, full user profiles |
| **RateBud** | ASIN to ratebud.ai API | Amazon + ratebud.ai hosts | Says no collection |

### Key Learnings from Comparison

1. **We're the only all-in-one**: No competitor combines filters + review analysis + deal scoring + price tracking + recall safety. This is the bundling play (Ben Thompson).
2. **We're the only privacy-first**: Honey collects PII, payment info, location, and web history. Our "zero collection" positioning is a genuine moat.
3. **Keepa validates premium pricing**: At ~€19/mo for JUST price charts, our $4.99/mo for 18+ features is aggressively underpriced. Room to raise.
4. **RateBud validates our architecture**: They also use a server API for pre-computed trust scores (similar to our planned crowd cache). With only 1,000 users, they prove the market exists but the Fakespot vacuum isn't filled yet.
5. **Honey's 13M users prove the market**: But Honey's privacy practices are a liability. We can differentiate by doing more with less data collection.
6. **CamelCamelCamel hasn't updated since 2024**: Stale competitor = opportunity. Their popup-only UX is inferior to our inline injection.

---

## 12. Privacy Language: Honest About External Requests

**Decision**: Stop claiming "100% client-side" and "zero data collection." Replace with honest, specific language about what external requests exist.

**Why**: A code audit revealed that user data DOES leave the browser in several ways:
- **Search queries** → CPSC SaferProducts.gov (recall checks)
- **ASINs** → Keepa (price chart images), Amazon (product page fetches)
- **Product titles** → CamelCamelCamel (when user clicks the link)
- **Filters/preferences** → Chrome Sync (part of Chrome's infrastructure)

None of these are "data collection" in the tracking/analytics sense, but claiming "100% client-side" is technically false and could erode trust if a user or journalist audits the extension.

**New language**: "Privacy-first design. All analysis runs locally in your browser. We don't collect, store, or transmit any personal data. External requests are limited to: Amazon (pages you're already browsing), CPSC (recall safety checks), and Keepa (price chart images)."

**Trade-off**: Less punchy than "100% client-side" but more defensible. Honesty builds long-term trust — especially for a product whose core value proposition IS trust.

### Learning
Never claim absolute privacy ("zero" / "100%") without a line-by-line audit of every fetch() call, image embed, and chrome.storage.sync usage in the codebase. External requests are easy to add and forget to disclose.

---

## 13. Time Saved Metric: Products-Based Estimation

**Decision**: Estimate time saved as `productsAnalyzed × 1 minute`. Display in popup insights dashboard.

**Why**: Each product analyzed saves the user from:
- Clicking into the product page (~15s)
- Reading 5-8 reviews to form an opinion (~2-3 min)
- Checking price history externally (~1-2 min)
- Manual trust assessment (is this brand legit? is the seller trustworthy?)

1 minute per product is a **conservative** estimate. The real savings per product are likely 2-5 minutes for products the user would have investigated manually. But not every analyzed product would have been clicked — many are filtered out at a glance.

**1 minute is the defensible floor** that no one can reasonably argue against.

**Display**: "Time Saved: 5h 47m" in the popup dashboard. Shown alongside Products Analyzed, Suspicious Flagged, and Est. Savings.

---

## 14. Crowd Cache Gating: Login Required

**Decision**: Require login (free or Pro) to access the crowd cache. Anonymous users cannot look up or contribute cached scores.

**Why**:
- The crowd cache is a **server-side feature with real costs** (D1 reads/writes)
- Login enables **contributor reputation tracking** (better anti-gaming than UUID-only)
- Login enables **account-level bans** for persistent bad actors
- The core extension experience (filters, basic review grades, sorting) still works without login

**Rate limits by tier**:
| Tier | Cache Lookups/hr | Contributions/hr |
|------|-----------------|-------------------|
| Free (logged in) | 100 | 50 |
| Pro | 500 | 200 |
| Anonymous | None | None |

**Trade-off**: Reduces crowd cache contribution volume vs. fully anonymous approach. Mitigated by the fact that cache lookups (which provide instant results) are the user-facing incentive to create an account.

**Incremental analysis decision**: NOT implemented. Full re-analysis on each request because reviews change, listings can be hijacked, and statistical signals need the complete review set. The crowd cache serves *results* (not partial data), which is effectively the same benefit without the consistency risks.
