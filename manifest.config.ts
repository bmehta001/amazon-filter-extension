import { defineManifest } from "@crxjs/vite-plugin";

// @ts-expect-error — browser_specific_settings is a Firefox-only field not in CRXJS types
export default defineManifest({
  manifest_version: 3,
  name: "Better Amazon Search",
  version: "1.0.0",
  minimum_chrome_version: "105",
  description:
    "Advanced filters for Amazon search results: min reviews, keyword exclusion, brand trust, CCC price history, and more.",
  permissions: ["storage", "alarms", "notifications", "declarativeContent"],
  host_permissions: [
    "https://www.amazon.com/*",
    "https://www.amazon.co.uk/*",
    "https://www.amazon.ca/*",
    "https://www.amazon.de/*",
    "https://www.amazon.fr/*",
    "https://www.amazon.it/*",
    "https://www.amazon.es/*",
    "https://www.amazon.in/*",
    "https://www.amazon.co.jp/*",
    "https://www.amazon.com.au/*",
    "https://www.saferproducts.gov/*",
  ],
  background: {
    service_worker: "src/background/service_worker.ts",
  },
  content_scripts: [
    {
      matches: [
        "https://www.amazon.com/s*",
        "https://www.amazon.co.uk/s*",
        "https://www.amazon.ca/s*",
        "https://www.amazon.de/s*",
        "https://www.amazon.fr/s*",
        "https://www.amazon.it/s*",
        "https://www.amazon.es/s*",
        "https://www.amazon.in/s*",
        "https://www.amazon.co.jp/s*",
        "https://www.amazon.com.au/s*",
        // Amazon Haul (discount store-within-a-store)
        "https://www.amazon.com/haul*",
        "https://www.amazon.co.uk/haul*",
        "https://www.amazon.ca/haul*",
        "https://www.amazon.de/haul*",
        "https://www.amazon.fr/haul*",
        "https://www.amazon.it/haul*",
        "https://www.amazon.es/haul*",
        "https://www.amazon.in/haul*",
        "https://www.amazon.co.jp/haul*",
        "https://www.amazon.com.au/haul*",
      ],
      js: ["src/content/index.ts"],
      css: [],
      run_at: "document_idle",
    },
  ],
  icons: {
    "16": "public/icons/icon16.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png",
  },
  action: {
    default_icon: {
      "16": "public/icons/icon16.png",
      "48": "public/icons/icon48.png",
      "128": "public/icons/icon128.png",
    },
    default_title: "Better Amazon Search",
    default_popup: "src/popup/popup.html",
  },
  // Firefox (Gecko) support — requires Firefox 121+ for MV3 service workers
  browser_specific_settings: {
    gecko: {
      id: "better-amazon-search@bmehta001",
      strict_min_version: "121.0",
    },
  },
} as Record<string, unknown>);  // eslint-disable-line
