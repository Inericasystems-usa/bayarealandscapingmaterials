# BALM platform — working rules

Bay Area Landscaping Materials: public website + Inerica POS + admin/driver screens, one pnpm/turbo monorepo. Client of Inerica Systems.

## Stack (pinned)

- Node 22, pnpm 9.12.0 (`packageManager`), turbo 2
- `apps/web`: Next.js 15.5.x (App Router, React 19, Tailwind 3), public site + `/pos` staff screens
- `apps/api`: Express 5 + Mongoose 8 (MongoDB replica set in production), pino logs, zod validation
- `apps/bridge` (counter-PC hardware bridge) and `apps/desktop` (Electron) install separately
- `packages/ui` (Button, Card, tokens), `packages/lib-domain`, `packages/shared-types`

## Commands

```sh
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build      # what CI runs
pnpm --filter @balm/web dev                                  # refuses to start on a production host
# Site-quality gate against a production build (no API needed):
cd apps/web && pnpm build && pnpm start -H 127.0.0.1 &
PW_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test e2e/site-quality.spec.ts
pnpm audit --prod --audit-level high                         # must be clean
```

Production deploy: `deploy/DEPLOY.md` and `scripts/deploy-production.sh` (PM2 `ecosystem.config.cjs`). Never run `pnpm dev`, `next dev` or `tsx watch` on the server.

## Non-negotiables

- **Security first.** No secrets in git (`.env*` ignored; `scripts/verify-handover.mjs` checks). No card data anywhere (quote-only storefront; card-present sales go through the Elavon terminal). Cost prices never enter the repo or the public site.
- **Catalog asset pack** lives in `apps/web/assets-src/` (git-ignored, never under `public/`): the POS asset manifest carries cost. `node scripts/import-catalog-assets.mjs` writes only public fields and optimised images.
- **Prices**: one switch, `apps/web/lib/storefront.ts` (`SHOW_PRICES`, on since 11 Oct 2026). Client components never import `lib/catalog` data modules; prices reach them as props (`lib/catalog/storefront.test.ts` enforces this).
- **Catalog data** is generated: edit the Flint export or `scripts/catalog-rules.mjs`, then `node scripts/build-catalog.mjs`. Never hand-edit `*.generated.ts`.
- **Consent first**: Google tags load only after the visitor accepts; defaults are denied; GPC honoured. No tags on `/pos` or `/customer-display`.
- **Accessibility**: WCAG 2.2 AA. Zero serious/critical axe violations (the site-quality spec fails the build otherwise). Every page: one H1, title, meta description.
- **Mobile**: nothing may extend past a 320 px viewport. Prefer CSS over client JS for motion; respect `prefers-reduced-motion`; content is visible without JavaScript.
- **Tailwind 3**: do not write `bg-[var(--x)]/50` (generates nothing). Use `bg-[color-mix(in_oklab,var(--x)_50%,transparent)]`.
- **Database**: use `where`/`findOne`/`page`/`aggregate` (filter in MongoDB). `all`/`filter`/`findBy` load a whole collection: only for small bounded lists or encrypted fields, with a comment saying why.

## Workflow

Plan first, small commits with descriptive messages, run lint/typecheck/test/build before every commit, and show the command output as evidence. Every new tool or service is designed as a reusable, documented microservice with its own SOP.
