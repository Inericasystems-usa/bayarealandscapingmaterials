// One-time importer: load apps/api/.data/*.json (+ leads.ndjson) into the
// Postgres `documents` table. Idempotent (ON CONFLICT DO NOTHING).
//
//   DATABASE_URL=postgres://... node scripts/import-json-to-pg.mjs
//
// Run once when moving a JSON-file deployment onto Postgres.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      collection text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, id))`);
}

async function importRows(collection, rows) {
  let n = 0;
  for (const row of rows) {
    if (!row || typeof row.id !== "string") continue;
    const r = await pool.query(
      "INSERT INTO documents (collection, id, data) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [collection, row.id, JSON.stringify(row)],
    );
    n += r.rowCount ?? 0;
  }
  console.log(`  ${collection}: imported ${n}/${rows.length}`);
}

async function main() {
  await ensureTable();
  let files = [];
  try {
    files = await readdir(DATA_DIR);
  } catch {
    console.error(`No ${DATA_DIR} directory — nothing to import.`);
    process.exit(0);
  }
  for (const f of files) {
    const full = path.join(DATA_DIR, f);
    if (f.endsWith(".json")) {
      const collection = f.slice(0, -5);
      const arr = JSON.parse(await readFile(full, "utf8"));
      if (Array.isArray(arr)) await importRows(collection, arr);
    } else if (f === "leads.ndjson") {
      const lines = (await readFile(full, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
      await importRows("leads", lines);
    }
  }
  await pool.end();
  console.log("Import complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
