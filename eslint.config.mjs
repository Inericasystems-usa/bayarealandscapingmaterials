// Flat ESLint config (ESLint 9) for the whole monorepo. Each package runs
// `eslint .` / `next lint` from its own dir; flat config is discovered by
// walking up to here.
import { createRequire } from "node:module";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

// The Next.js and React plugins come with eslint-config-next, which only the
// web app depends on; resolve them through it so pnpm's strict layout holds.
const fromWeb = createRequire(new URL("./apps/web/package.json", import.meta.url));
const fromNextConfig = createRequire(fromWeb.resolve("eslint-config-next"));
const nextPlugin = fromNextConfig("@next/eslint-plugin-next");
const reactPlugin = fromNextConfig("eslint-plugin-react");

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/coverage/**",
      "Back-end/**",
      "Front-end/**",
      "**/*.config.{js,cjs,mjs,ts}",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Correctness rules we care about; noisy stylistic ones stay off so a
      // never-before-linted codebase passes `--max-warnings 0` in CI.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // The few deliberate escapes carry an inline disable with the reason.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "off",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  // React components: both hooks rules, plus React's own checks.
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: { "react-hooks": reactHooks, react: reactPlugin },
    settings: { react: { version: "detect" } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react/no-danger": "warn",
    },
  },
  // The web app also gets Next.js's recommended and Core Web Vitals rules.
  {
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    settings: { next: { rootDir: "apps/web/" } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  // A disable comment that no longer suppresses anything is an error, so
  // stale exceptions cannot pile up.
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
);
