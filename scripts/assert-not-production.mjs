#!/usr/bin/env node
/**
 * Runs before `pnpm dev`. Refuses on a server marked as production
 * (/etc/inerica/production, written by infra/pci/host/60-production-mode.sh, or
 * INERICA_PRODUCTION=1): dev servers put server paths and source code into
 * every page, and that is how the live site failed its PCI ASV scan.
 */
import { existsSync } from "node:fs";

if (existsSync("/etc/inerica/production") || process.env.INERICA_PRODUCTION === "1") {
  console.error("pnpm dev is blocked on a production host. Build and run with PM2: see deploy/DEPLOY.md.");
  process.exit(1);
}
