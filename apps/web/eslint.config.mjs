// Web app uses the Next.js ESLint config (core-web-vitals + typescript), which
// defines the @next/next, react and react-hooks rules its source disables.
// This local flat config takes precedence over the repo-root config for /web.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: [".next/**", "node_modules/**", "e2e/**", "playwright.config.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Don't flag the existing `eslint-disable react/no-danger` directives.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      // Apostrophes/quotes in copy are fine — stylistic noise, not a bug.
      "react/no-unescaped-entities": "off",
    },
  },
];
