#!/usr/bin/env node
/**
 * Is the live site up, and is it a production build?
 *
 *   node scripts/check-production.mjs [base URL]     (pnpm deploy:check)
 *
 * The base URL defaults to https://bayarealandscapingmaterials.com. Run after a
 * deploy, and every 30 minutes by .github/workflows/production-check.yml, which
 * alerts when it fails. It exists because the site was once served by
 * `next dev` for weeks and nothing noticed: dev mode publishes source code and
 * server paths, and that failed the PCI scan (deploy/DEPLOY.md).
 *
 * Plain HTTPS GETs only, no dependencies (Node 20+ has fetch). Exits 1 with
 * every problem listed.
 */

const APEX = "bayarealandscapingmaterials.com";
const base = (process.argv[2] ?? `https://${APEX}`).replace(/\/+$/, "");
const TIMEOUT_MS = 20_000;

// What only a development server puts into a page.
const DEV_MARKERS = [
  "/_next/static/development",
  "webpack-hmr",
  "__nextDevClientId",
  "next-dev",
  "jsxDEV",
  "react-refresh",
];

const problems = [];
const notes = [];

/** GET without following redirects; one retry after a network error or 5xx. */
async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": "balm-production-check/1" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status >= 500 && attempt < 2) throw new Error(`HTTP ${res.status}`);
      return { res, body: await res.text() };
    } catch (err) {
      if (attempt >= 2) return { error: err instanceof Error ? err.message : String(err) };
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
}

async function checkHome() {
  const url = `${base}/`;
  const r = await get(url);
  if (r.error) return problems.push(`${url}: no answer (${r.error})`);
  if (r.res.status !== 200) return problems.push(`${url}: HTTP ${r.res.status}, expected 200`);
  const powered = r.res.headers.get("x-powered-by");
  if (powered) problems.push(`${url}: sends X-Powered-By: ${powered}`);
  const found = DEV_MARKERS.filter((m) => r.body.includes(m));
  if (found.length) problems.push(`${url}: development-server markers in the page (${found.join(", ")}): the site is running next dev`);
  else notes.push(`${url}: 200, production build`);
}

async function checkApi() {
  const url = `${base}/api/v1/health`;
  const r = await get(url);
  if (r.error) return problems.push(`${url}: no answer (${r.error})`);
  if (r.res.status !== 200) return problems.push(`${url}: HTTP ${r.res.status}, expected 200`);
  let ok = false;
  try {
    ok = JSON.parse(r.body)?.ok === true;
  } catch {
    // not JSON: reported below
  }
  if (!ok) problems.push(`${url}: 200 but not {"ok":true}`);
  else notes.push(`${url}: ok`);
}

/** www must send visitors (and their lead forms) to the one canonical host. */
async function checkWww() {
  if (new URL(base).hostname !== APEX) return;
  const url = `https://www.${APEX}/contact`;
  const r = await get(url);
  if (r.error) return problems.push(`${url}: no answer (${r.error})`);
  const location = r.res.headers.get("location") ?? "";
  if (r.res.status !== 301 || location !== `https://${APEX}/contact`)
    problems.push(`${url}: HTTP ${r.res.status} to "${location}", expected 301 to https://${APEX}/contact`);
  else notes.push(`${url}: 301 to the apex`);
}

await Promise.all([checkHome(), checkApi(), checkWww()]);

for (const n of notes) console.log(`ok    ${n}`);
for (const p of problems) console.log(`FAIL  ${p}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  const lines = [
    `### Production check: ${problems.length ? "FAILED" : "passed"}`,
    "",
    ...problems.map((p) => `- FAIL: ${p}`),
    ...notes.map((n) => `- ok: ${n}`),
    "",
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
}

// exitCode rather than exit(): lets open sockets close first (exit() mid-close
// aborts Node on Windows).
if (problems.length) process.exitCode = 1;
