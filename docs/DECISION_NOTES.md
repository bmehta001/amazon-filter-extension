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

| Extension | Client-Side | Server-Side | Backend Cost |
|-----------|-------------|-------------|-------------|
| **Better Amazon Search** | ✅ All analysis | Planned (crowd cache) | $0 today, $0-5/mo planned |
| **Keepa** | Price display only | ✅ Price history DB | High (massive DB) |
| **ReviewMeta** | Display only | ✅ Review analysis | Medium |
| **CamelCamelCamel** | Display only | ✅ Price tracking | Medium |
| **Honey** | Coupon injection | ✅ Coupon DB + deal comparison | Very high (PayPal-funded) |
| **RateBud** | ✅ Analysis | Some server validation | Low |

### Freemium Model Comparison

| Extension | Free Tier | Paid Tier | Price |
|-----------|-----------|-----------|-------|
| **Better Amazon Search** | Filters, simple review grade | ML analysis, deal scoring, watchlist, export, etc. | $4.99/mo, $39.99/yr |
| **Keepa** | Basic price chart | Full history, API access | ~$2/mo |
| **ReviewMeta** | Full analysis | N/A (fully free) | Free |
| **CamelCamelCamel** | Full tracking | N/A (fully free) | Free (ad-supported) |
| **Honey** | Full features | N/A (affiliate-funded) | Free |
| **RateBud** | Basic grades | Unknown | Free with ads? |

### Privacy Comparison

| Extension | Data Collection | Server Calls | User Tracking |
|-----------|----------------|-------------|---------------|
| **Better Amazon Search** | None (local only) | CPSC recalls only | None |
| **Keepa** | Price observations sent to server | Every page load | Anonymous price data |
| **ReviewMeta** | URL/ASIN sent to server | Per analysis request | IP + ASIN logged |
| **Honey** | Purchase data, browsing on retail sites | Extensive | User profiles for targeting |
| **RateBud** | Unknown | Unknown | Unknown |

### Key Learning from Comparison

1. **We're the only all-in-one**: No competitor combines filters + review analysis + deal scoring + price tracking + recall safety. This is the bundling play (Ben Thompson).
2. **We're the only privacy-first**: Every competitor with a backend sends user data to servers. Our "zero collection" positioning is unique and defensible.
3. **Free competitors set the floor**: ReviewMeta and CamelCamelCamel are fully free. Our Pro tier must offer clearly differentiated value (ML analysis, deal scoring, watchlist alerts) to justify charging.
4. **Keepa's $2/mo validates willingness to pay**: Amazon shoppers will pay for tools. Our $4.99/mo is higher but offers 10x more features.
