import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Boots the API + web dev servers, then drives Chromium.
 * Run: `npx playwright install chromium` once, then `pnpm --filter @balm/web test:e2e`.
 * Kept out of the unit `pnpm test` (CI runs unit/integration; E2E is a separate job).
 */
export default defineConfig({
  testDir: "./e2e",
  // Generous per-test budget: the first /pos navigation pays Next's cold
  // route-compile cost in dev (30–60s) on top of the actual assertions.
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @balm/api dev",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @balm/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
