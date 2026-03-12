import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Better Amazon Search",
  version: "1.0.0",
  description:
    "Advanced filters for Amazon search results: min reviews, keyword exclusion, brand trust, CCC price history, and more.",
  permissions: ["storage", "alarms"],
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
  },
});
