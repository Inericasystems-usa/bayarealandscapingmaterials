import { customers, PII_FIELDS } from "../modules/customers.js";
import { settings } from "../modules/settings.js";
import { encryptField, isEncrypted, isEncryptionConfigured } from "../lib/encryption.js";
import { isMain, runScript } from "./cli.js";

/**
 * Encrypts, in place, the sensitive fields still stored as plaintext: customer
 * phone, e-mail and addresses, and the website sync token. Rows written before
 * DATA_ENCRYPTION_KEY was set read correctly either way (decryption passes
 * plaintext through); this closes the gap without waiting for each row to be
 * edited. Safe to run more than once: encrypted values are skipped.
 *
 *   pnpm --filter @balm/api encrypt:fields -- --dry-run   # counts only
 *   pnpm --filter @balm/api encrypt:fields
 */

// A non-empty string that isn't ciphertext yet.
const PLAINTEXT = { $type: "string", $nin: [""], $not: /^enc:v1:/ };
const needsIt = (v: unknown): v is string => typeof v === "string" && v !== "" && !isEncrypted(v);

export interface EncryptReport {
  customers: number; // rows with at least one plaintext field
  customerFields: number;
  settings: number; // 1 when the sync token was plaintext
  dryRun: boolean;
}

export async function encryptPlaintextFields(opts: { dryRun?: boolean } = {}): Promise<EncryptReport> {
  if (!isEncryptionConfigured()) throw new Error("DATA_ENCRYPTION_KEY is not set: there is no key to encrypt with");
  const dryRun = Boolean(opts.dryRun);
  const report: EncryptReport = { customers: 0, customerFields: 0, settings: 0, dryRun };

  const rows = await customers.where({ $or: PII_FIELDS.map((f) => ({ [f]: PLAINTEXT })) });
  for (const c of rows) {
    const patch: Record<string, string> = {};
    for (const f of PII_FIELDS) if (needsIt(c[f])) patch[f] = encryptField(c[f]);
    report.customers++;
    report.customerFields += Object.keys(patch).length;
    if (!dryRun) await customers.update(c.id, patch);
  }

  for (const s of await settings.where({ "website.apiToken": PLAINTEXT })) {
    report.settings++;
    if (!dryRun) await settings.update(s.id, { website: { ...s.website, apiToken: encryptField(s.website.apiToken) } });
  }
  return report;
}

if (isMain(import.meta.url)) {
  void runScript(async (args) => {
    const r = await encryptPlaintextFields({ dryRun: args.includes("--dry-run") });
    const verb = r.dryRun ? "would encrypt" : "encrypted";
    console.log(`${verb} ${r.customerFields} field(s) on ${r.customers} customer(s), and ${r.settings} website sync token(s)`);
    if (r.dryRun) console.log("dry run: nothing changed");
  });
}
