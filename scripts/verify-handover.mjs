#!/usr/bin/env node
/**
 * Handover safety gate.
 *
 * Before this site is packaged and handed to an outside developer / VPS, this
 * script scans EXACTLY the files that would ship (git-tracked files — so
 * .env, node_modules, dist, .next, data/ are already excluded by .gitignore)
 * and FAILS the package if any real secret or credential is present.
 *
 * The rule from the owner: brain/AI prompts and keys must never leave the
 * building. Env *values* live only in .env (gitignored); this gate is the
 * backstop for the two ways a secret still escapes: (1) someone hardcodes a key
 * in tracked source, (2) a real .env / credential file gets committed by
 * mistake. Either one fails the build here instead of on a stranger's disk.
 *
 * Exit 0 = clean to hand over. Exit 1 = secrets found, do NOT ship.
 *
 * Run: `node scripts/verify-handover.mjs`  (or `pnpm handover:verify`)
 */
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const MAX_BYTES = 2_000_000; // skip anything bigger than 2MB (assets/binaries)

// Files that must never be in a handover bundle even if someone `git add -f`'d them.
const FORBIDDEN_PATHS = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.local$/,
  /(^|\/)\.env\.production$/,
  /(^|\/)\.env\.[^/]*\.local$/,
  /(^|\/)id_rsa$/,
  /(^|\/)id_ed25519$/,
  /\.pem$/,
  /(^|\/)\.jwt_secret$/,
  /\.tenant-secret$/,
  /(^|\/)secrets?\.json$/,
  /\.sqlite$/,
  /\.db$/,
];

// Real-secret content signatures. Each is a hard fail. Keep these specific so
// they match live credentials, not variable names or placeholders.
const SECRET_PATTERNS = [
  { name: "Stripe live secret key", re: /\bsk_live_[0-9A-Za-z]{16,}/ },
  { name: "Stripe test secret key", re: /\bsk_test_[0-9A-Za-z]{16,}/ },
  { name: "Stripe restricted key", re: /\brk_live_[0-9A-Za-z]{16,}/ },
  { name: "Stripe webhook secret", re: /\bwhsec_[0-9A-Za-z]{16,}/ },
  { name: "Anthropic API key", re: /\bsk-ant-[0-9A-Za-z_-]{20,}/ },
  { name: "OpenAI API key", re: /\bsk-(proj-)?[0-9A-Za-z]{32,}/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "Slack token", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}/ },
  {
    // A high-entropy secret embedded in a URL query param, e.g. a Workiz
    // ...?ac=<64-hex> booking token, ...?token=, ...?api_key=. These slip past
    // the "assignment" pattern because they live inside a string URL.
    name: "Secret in URL query param",
    re: /[?&](?:ac|token|key|secret|api[_-]?key|apikey|access[_-]?token|auth)=([A-Za-z0-9]{20,})/i,
    allow: (m) => /^(your|example|xxx|test|demo|placeholder|token|abc|000)/i.test(m[1]),
  },
  {
    // A secret-looking assignment with a real value (>=16 non-placeholder chars).
    // The value stays on one line, so a name inside one string can't pair up
    // with the next string literal further down the file.
    name: "Hardcoded secret assignment",
    re: /\b(?:[A-Z_]*(?:SECRET|TOKEN|PASSWORD|API[_-]?KEY|TENANT[_-]?SECRET|PRIVATE[_-]?KEY))\b\s*[:=]\s*["'`]([^"'`\r\n]{16,})["'`]/i,
    // Skip placeholders, interpolated/generated values, and obvious fakes so
    // .env.example, defaults, and simulation code don't trip it.
    allow: (m) =>
      /\$\{|\$\(|`\s*\+/.test(m[1]) || // template interpolation / concatenation → not a literal secret
      /^(your|example|changeme|placeholder|xxx|<|\{|\$\{|todo|sample|dummy|test[_-]?only|replace)/i.test(m[1]) ||
      /^(simulated|super[_-]?secret|fake|mock|sync[_-]?token|demo|seed|local)/i.test(m[1]) ||
      /(changeme|example\.com|placeholder|your[_-]?key|000000|123450|abc123|xyz789)/i.test(m[1]),
  },
];

// Paths where a "secret assignment" is expected to be a placeholder/fixture, not
// a real value: env examples, docs, and any test/spec/story/mock file.
const PLACEHOLDER_FILES = [
  /(^|\/)\.env\.example$/,
  /(^|\/)README/i,
  /(^|\/)DEPLOY\.md$/,
  /\.(test|spec)\.[jt]sx?$/,
  /(^|\/)__(tests|mocks)__\//,
  /\.stories\.[jt]sx?$/,
  /(^|\/)(test|tests|e2e|fixtures)\//,
];

function tracked() {
  return execSync("git ls-files", { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
}

const findings = [];
const files = tracked();

for (const f of files) {
  for (const re of FORBIDDEN_PATHS) {
    if (re.test(f)) findings.push({ file: f, issue: `forbidden file in bundle (${re})` });
  }
}

const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|env|example|yml|yaml|sh|sql|html|css|prisma)$/i;
for (const f of files) {
  if (!TEXT_EXT.test(f) && !/\.env/.test(f)) continue;
  let content;
  try {
    if (statSync(f).size > MAX_BYTES) continue;
    content = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  const isPlaceholderFile = PLACEHOLDER_FILES.some((re) => re.test(f));
  for (const p of SECRET_PATTERNS) {
    // Every match counts: a placeholder near the top must not hide a real value further down.
    const every = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`);
    const m = [...content.matchAll(every)].find((x) => !(p.allow && p.allow(x)));
    if (!m) continue;
    // In known placeholder files, only the specific credential prefixes count.
    if (isPlaceholderFile && p.name === "Hardcoded secret assignment") continue;
    findings.push({ file: f, issue: `${p.name}: …${m[0].slice(0, 24)}…` });
  }
}

if (findings.length) {
  console.error("\n✗ HANDOVER BLOCKED — secrets/credentials found in files that would ship:\n");
  for (const x of findings) console.error(`  ${x.file}\n    → ${x.issue}`);
  console.error(`\n${findings.length} issue(s). Remove them (move values to .env) before packaging.\n`);
  process.exit(1);
}

console.log(`✓ Handover clean — scanned ${files.length} tracked files, no secrets or credential files found.`);
