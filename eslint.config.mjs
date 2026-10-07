// Flat ESLint config (ESLint 9) for the whole monorepo. Each package runs
// `eslint .` / `next lint` from its own dir; flat config is discovered by
// walking up to here.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

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
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "off",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  // React components (web app): define the hooks rules so inline disable
  // directives resolve; rules-of-hooks catches real bugs, exhaustive-deps is off.
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  // Existing inline `eslint-disable react-hooks/exhaustive-deps` comments point
  // at an off rule — don't flag them as unused.
  {
    linterOptions: { reportUnusedDisableDirectives: "off" },
  },
);
