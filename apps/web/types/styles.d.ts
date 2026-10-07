/**
 * Ambient declaration for global stylesheet side-effect imports
 * (e.g. `import "./globals.css"` in app/layout.tsx).
 *
 * Next processes these at build time, but the `next` package does not ship a
 * `*.css` module declaration. Without this, whether the import type-checks
 * depends on generated artifacts under `.next/types` — so it passed in one
 * context and failed with TS2882 in another (CLI vs. editor, warm vs. cold
 * checkout). Declaring it here makes the import resolve identically everywhere
 * and removes the need for a `@ts-expect-error` that is itself an error
 * whenever the suppressed error happens not to occur.
 *
 * Safe as a wildcard: this app imports stylesheets only for their side effects
 * and uses no CSS modules, so nothing depends on a typed export shape.
 */
declare module "*.css";
