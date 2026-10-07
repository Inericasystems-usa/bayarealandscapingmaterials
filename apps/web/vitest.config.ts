import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests for the measurement stack. Node environment on purpose: the code
 * under test touches only `window.dataLayer`, `document.cookie` and
 * `window.location`, which the tests stub explicitly. That keeps a DOM library
 * out of the dependency tree.
 *
 * Full component rendering and the delegated click listener are NOT covered
 * here — those need a real DOM and live in the Playwright suite (e2e/).
 */
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
