# Review Notes

Findings from code and architecture reviews, prioritized by severity.

---

## Security Audit (April 2026) — `d3f48d6`

### 🔴 CRITICAL — Fixed

| # | Finding | Fix | Status |
|---|---------|-----|--------|
| 1 | **Pro license bypassable** — client-side storage, no server validation | Acknowledged — intentional until backend Phase 3. Server-side JWT planned. | ⏳ Deferred |

### 🔴 HIGH — Fixed

| # | Finding | Fix | Commit |
|---|---------|-----|--------|
| 2 | **sessionStorage leaks to Amazon's JS** — Amazon scripts could read cached trust scores, brand preferences | Migrated to `chrome.storage.session` (extension-isolated) | `d3f48d6` |

### 🟡 MEDIUM — Fixed

| # | Finding | Fix | Commit |
|---|---------|-----|--------|
| 3 | **Unvalidated watchlist domain** — open redirect via crafted domain | Added ALLOWED_DOMAINS whitelist (10 locales) | `d3f48d6` |
| 4 | **Unvalidated ASIN in notification handler** — path traversal risk | Strict `[A-Z0-9]{10}` regex | `d3f48d6` |

### ℹ️ LOW — Noted

| # | Finding | Status |
|---|---------|--------|
| 5 | **CPSC API leaks search queries** — user's product search terms sent to saferproducts.gov | Noted — will proxy through own server in Phase 3 |

---

## Architecture Review (April 2026) — `0018690`, `0368182`

### 🔴 BUGS — Fixed

| # | Finding | Fix | Commit |
|---|---------|-----|--------|
| B1 | **XSS via innerHTML** in ProductScore BSR row | `createElement`/`textContent` | `0018690` |
| B2 | **Duplicate computeRedFlagReport()** call | Reuse variable | `0018690` |
| B3 | **Race condition** in dashboard increment() | Serialization queue | `0018690` |
| B4 | **Wave overflow** at CURRENT_WAVE=8 | Boundary guard | `0018690` |
| B5 | **GBP price parsing** wrong branch | Separated EUR/GBP | `0018690` |

### 🟡 SMELLS — Fixed

| # | Finding | Fix | Commit |
|---|---------|-----|--------|
| S2 | **Fragile color check** in cardActions hover | `dataset.state` attribute | `0018690` |
| S3 | **Dead getOverallLabel()** function | Deleted | `0018690` |
| S6 | **Gift plans in chrome.storage.sync** (quota pressure) | Moved to `.local` | `0018690` |
| S7 | **Expired license cached as "pro"** | Expiration check on init | `0018690` |
| S8 | **Image URL validation** missing | Amazon CDN domain check | `0368182` |
| S9 | **Dead featureGate "free" branch** | Simplified | `0368182` |
| S10 | **Overflow menu positioning** wrong element | Container-relative | `0368182` |

### 🟢 SUGGESTIONS — Addressed

| # | Finding | Status |
|---|---------|--------|
| G2 | Unsafe `isReleased` default (true for unknown) | Changed to `false` in `0368182` |

---

## UI/UX Design Audit (April 2026)

Full audit saved in `files/ui-design-audit.txt` (28KB).

### Key Actions Taken

| Finding | Action | Commit |
|---------|--------|--------|
| 14 elements per card (density crisis) | Badge consolidation: 10 → 3 zones | `1dfe9ab` |
| 6 action buttons per card | Overflow menu: 2 + ⋯ | `1dfe9ab` |
| 3 separate review panels | Unified into single collapsible section | `1dfe9ab` |
| No accessibility foundation | ARIA, focus traps, keyboard nav on modals | `144968e` |
| 5 different border radii | Design token system (4/8/16px) | `e4b4882` |
| Mixed Bootstrap + Amazon colors | Standardized to 5 semantic colors | `144968e` |
| Popup: scrolling grab-bag | Tab navigation (Settings / Watchlist / Lists) | `144968e` |

---

## Red Team Analysis (April 2026)

Full analysis saved in `files/red-team-analysis.txt` (8KB).

### Key Findings

| Threat | Likelihood | Mitigation | Status |
|--------|-----------|------------|--------|
| Amazon DOM changes | HIGH | Centralized selectors + remote override + fallback tracking | ✅ Built |
| Review gating (login-required) | Already done | Content script runs as logged-in user | ✅ Inherently safe |
| CSP blocking injection | LOW | Chrome guarantees content script injection bypasses page CSP | ✅ N/A |
| Bot detection on fetches | MEDIUM | Rate limiting, user cookies, crowdsourced cache reduces fetches | ✅ Designed |
| Chrome Web Store takedown | LOW-MEDIUM | Multi-store publishing (CWS + AMO), sideload instructions | 📋 Planned |
