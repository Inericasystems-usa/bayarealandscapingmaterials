import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Boots the API + web dev servers, then drives Chromium.
 * Run: `npx playwright install chromium` once, then `pnpm --filter @balm/web test:e2e`.
 * Kept out of the unit `pnpm test` (CI runs unit/integration; E2E is a separate job).
 */
// PW_BASE_URL set: test an already-running site (a production build in CI's
// site-quality job, or a deployed host) with no API or dev servers booted.
const external = process.env.PW_BASE_URL;

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
    baseURL: external ?? "http://localhost:3000",
    trace: "on-first-retry",
    // Use a preinstalled Chromium when the bundled one is not downloaded.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external ? undefined : [
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
