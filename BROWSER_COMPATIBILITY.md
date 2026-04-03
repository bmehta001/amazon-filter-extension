# Browser Compatibility

## Officially Supported Browsers

| Browser | Engine | Min Version | Install Source | Status |
|---------|--------|-------------|---------------|--------|
| **Google Chrome** | Chromium/Blink | 105+ | Chrome Web Store | ✅ Primary target |
| **Microsoft Edge** | Chromium/Blink | 105+ | Edge Add-ons / Chrome Web Store | ✅ Full support |
| **Mozilla Firefox** | Gecko | 121+ | Firefox AMO | ✅ Full support (MV3 service workers require 121+) |
| **Brave** | Chromium/Blink | 105+ | Chrome Web Store | ✅ Full support (same engine as Chrome) |
| **Opera** | Chromium/Blink | 91+ | Chrome Web Store | ✅ Full support |
| **Vivaldi** | Chromium/Blink | 105+ | Chrome Web Store | ✅ Full support |
| **Arc** | Chromium/Blink | 105+ | Chrome Web Store | ✅ Full support |

## Community / Niche Browsers

| Browser | Engine | Support | Notes |
|---------|--------|---------|-------|
| **Floorp** | Gecko (Firefox fork) | ⚠️ Likely works | Uses ManifestTransformer to convert Chrome MV3 → Firefox format. Polyfills Chrome-only APIs. Most MV3 extensions work, but not all. Since v12.11.0 supports Chrome Web Store install. |
| **Orion** (Kagi) | WebKit | ⚠️ Partial | ~70% WebExtensions API support. Supports both MV2 and MV3. Our extension likely works for basic features but complex APIs (declarativeContent, notifications) may not be available. Mac/iOS only. |
| **Waterfox** | Gecko (Firefox fork) | ⚠️ Likely works | Firefox-compatible; should work if installed from AMO. |
| **LibreWolf** | Gecko (Firefox fork) | ⚠️ Likely works | Firefox-compatible, privacy-hardened. May block some telemetry-adjacent APIs. |
| **Ungoogled Chromium** | Chromium/Blink | ✅ Works | Same engine as Chrome. Cannot install from Chrome Web Store (no Google account); requires manual .crx sideloading. |
| **Samsung Internet** | Chromium/Blink | ❌ No extension support | Mobile-only, no extension API. |
| **Safari** | WebKit | ❌ Not supported | Different extension format (Safari Web Extensions). Would require a separate Xcode project with a native wrapper. Not planned. |

## Limiting Platform Features

These features determine our minimum browser versions:

| Feature | Required By | Chrome | Firefox | Edge |
|---------|-------------|--------|---------|------|
| **Manifest V3** | Entire extension | 88+ | 109+ | 88+ |
| **MV3 Service Workers** | Background price checks, alarms | 88+ | 121+ | 88+ |
| **CSS `:has()` selector** | Sponsored result hiding | 105+ | 121+ | 105+ |
| **ES2020 features** | Optional chaining, nullish coalescing | 80+ | 74+ | 80+ |
| **`chrome.storage.session`** | Compare tray | 102+ | 115+ | 102+ |
| **`chrome.alarms`** | Watchlist price checks | 88+ | 109+ | 88+ |
| **`chrome.notifications`** | Price drop alerts | 88+ | 109+ | 88+ |
| **`chrome.declarativeContent`** | Icon activation on Amazon pages | 88+ | ❌ Not supported | 88+ |
| **`sessionStorage`** | Enrichment cache | All | All | All |
| **`DOMParser`** | Review/product page parsing | All | All | All |
| **Shadow DOM v1** | Filter bar isolation | 63+ | 63+ | 79+ |

**Bottleneck**: CSS `:has()` (Chrome 105+) and Firefox MV3 service workers (Firefox 121+).

## Chrome API Stability & Future Risks

### Current MV3 Status (as of April 2026)
- MV3 is **stable and enforced** — MV2 is fully sunset on Chrome/Edge.
- No breaking changes expected to core APIs we use: `storage`, `alarms`, `notifications`, `runtime.onMessage`.

### Known Future Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Service worker lifetime changes** | Medium | Service worker may be terminated faster (currently ~30s idle) | We already persist all state in `chrome.storage`; no global variables relied upon between events. |
| **`declarativeContent` deprecation** | Low | Would affect extension icon activation | Fallback: always show icon, check URL in popup. |
| **`chrome.notifications` API changes** | Low | Could affect price drop alerts | Notifications are non-critical; watchlist data still visible in popup. |
| **Content Security Policy tightening** | Medium | May restrict inline styles or eval | We don't use `eval`. Our inline styles are extension-injected via `createElement`, not script injection. |
| **Amazon DOM structure changes** | High (happens regularly) | Breaks extractors, review parsers | Covered by 1124 unit tests + E2E tests. Fast iteration cycle. |
| **Cross-origin fetch restrictions** | Low-Medium | Could affect product page fetching | We use `credentials: "same-origin"` from content scripts on Amazon's own domain — this is same-origin, not cross-origin. |

### What We DON'T Use (Safe)
- ❌ `webRequest` (deprecated blocking API) — we use content scripts instead
- ❌ `eval()` or `new Function()` — prohibited in MV3 CSP
- ❌ Remotely hosted code — all code is bundled
- ❌ `chrome.tabs.executeScript` (MV2) — we use `scripting.executeScript` pattern via content scripts
- ❌ Background pages (MV2) — we use service workers

## Testing Matrix

Before each release, test on:

| Priority | Browser | Version | How |
|----------|---------|---------|-----|
| P0 | Chrome Stable | Latest | Primary development browser |
| P0 | Edge Stable | Latest | Install from Chrome Web Store |
| P1 | Firefox Stable | Latest | Install from AMO |
| P2 | Chrome Beta | Latest | Catch upcoming breaking changes |
| P2 | Brave Stable | Latest | Verify no shield/privacy interference |
| P3 | Firefox Developer Edition | Latest | Catch Firefox-specific issues early |

## How to Handle Browser-Specific Issues

1. **Check `chrome` vs `browser` API namespace**: Firefox uses `browser.*` with Promises natively. Our Vite build (via `@crxjs/vite-plugin`) handles polyfilling. If we switch build tools, we need the `webextension-polyfill` package.

2. **`declarativeContent` Firefox fallback**: Firefox doesn't support `declarativeContent`. Our service worker wraps it in a try-catch. On Firefox, the extension icon is always visible.

3. **Feature detection pattern**:
```typescript
// Prefer feature detection over browser sniffing
if (typeof chrome.declarativeContent !== "undefined") {
  // Chrome/Edge path
} else {
  // Firefox/other path
}
```
