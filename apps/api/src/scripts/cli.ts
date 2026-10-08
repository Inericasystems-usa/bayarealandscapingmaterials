import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { config } from "../config.js";
import "../models/index.js";

/**
 * Shared plumbing for the maintenance scripts in this folder. They connect with
 * the API's own settings (apps/api/.env, or the environment) and never print the
 * connection string. Indexes are left to the API, which builds them at start.
 */

/** True when `moduleUrl` is the file node was started with (not an import from a test). */
export function isMain(moduleUrl: string): boolean {
  return Boolean(process.argv[1]) && moduleUrl === pathToFileURL(process.argv[1]!).href;
}

/** Connect, run `fn`, disconnect; a failure prints its message and exits 1. */
export async function runScript(fn: (args: string[]) => Promise<void>): Promise<void> {
  try {
    await mongoose.connect(config.MONGODB_URL, { serverSelectionTimeoutMS: 8000, autoIndex: false });
    await fn(process.argv.slice(2));
    await mongoose.disconnect();
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  }
}
