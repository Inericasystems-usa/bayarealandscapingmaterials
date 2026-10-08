import { migrateLegacyUploads } from "../modules/uploads.js";
import { isMain, runScript } from "./cli.js";

/**
 * Moves images still stored as base64 inside `uploads` rows into the "uploads"
 * GridFS bucket. Safe to run more than once, and while the API runs (it moves
 * the same rows on first read).
 *
 *   pnpm --filter @balm/api migrate:uploads -- --dry-run   # counts only
 *   pnpm --filter @balm/api migrate:uploads
 */
if (isMain(import.meta.url)) {
  void runScript(async (args) => {
    const dryRun = args.includes("--dry-run");
    const r = await migrateLegacyUploads({ dryRun, log: (m) => console.log(m) });
    console.log(
      dryRun
        ? `dry run: ${r.legacy} upload(s) still inline (${r.bytes} bytes); nothing changed`
        : `moved ${r.moved} of ${r.legacy} inline upload(s) to GridFS (${r.bytes} bytes)`,
    );
  });
}
