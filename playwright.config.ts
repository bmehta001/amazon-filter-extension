import { defineConfig } from "@playwright/test";
import path from "path";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  retries: 0,
  use: {
    headless: false, // Extensions require headed mode
  },
  projects: [
    {
      name: "chromium",
      use: {
        // Chrome extension testing requires a persistent context
        // configured per-test via BrowserType.launchPersistentContext
      },
    },
  ],
});
