import { defineConfig } from "vitest/config";

/**
 * The domain money engine is the one place every dollar is calculated. It's pure
 * and must stay exhaustively tested — the coverage floor fails CI if a new,
 * untested code path sneaks in. Kept at 100% because there's no excuse for an
 * uncovered branch in money math.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/index.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
