import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { envSchema, startupProblems } from "./config.js";

describe("config defaults", () => {
  it("treat an unset NODE_ENV as production and listen on loopback", () => {
    const c = envSchema.parse({});
    expect(c.NODE_ENV).toBe("production");
    expect(c.HOST).toBe("127.0.0.1");
    expect(c.CORS_ORIGINS).toEqual([]);
    expect(envSchema.parse({ CORS_ORIGINS: " http://localhost:3000/ ,https://staging.example " }).CORS_ORIGINS).toEqual([
      "http://localhost:3000",
      "https://staging.example",
    ]);
  });
});

// A production key, as `openssl rand -hex 32` makes one.
const KEY = { DATA_ENCRYPTION_KEY: "ab".repeat(32) };

describe("startup refusals", () => {
  it("refuse demo seeding in production", () => {
    expect(startupProblems({ NODE_ENV: "production", SEED_DEMO: "true" }, KEY, false)).toEqual([expect.stringContaining("SEED_DEMO=true")]);
    expect(startupProblems({ NODE_ENV: "test", SEED_DEMO: "true" }, {}, false)).toEqual([]);
    expect(startupProblems({ NODE_ENV: "production" }, { ...KEY, ALLOW_PIN_LOGIN: "true" }, false)).toEqual([]); // a counter PC
  });

  it("on a production host refuse any NODE_ENV but production, demo data and PIN sign-in", () => {
    expect(startupProblems({ NODE_ENV: "development", SEED_DEMO: "true" }, { ALLOW_PIN_LOGIN: "true" }, true)).toHaveLength(3);
    expect(startupProblems({ NODE_ENV: "production" }, KEY, true)).toEqual([]);
  });

  it("refuse production without a data encryption key, or with a placeholder one", () => {
    const missing = startupProblems({ NODE_ENV: "production" }, {}, false);
    expect(missing).toEqual([expect.stringContaining("DATA_ENCRYPTION_KEY")]);
    expect(startupProblems({ NODE_ENV: "production" }, { DATA_ENCRYPTION_KEY: "changeme" }, false)).toEqual(missing);
    expect(startupProblems({ NODE_ENV: "production" }, { DATA_ENCRYPTION_KEY: " ".repeat(40) }, false)).toEqual(missing);
    expect(startupProblems({ NODE_ENV: "production" }, KEY, false)).toEqual([]);
    // Development and tests may run without one (fields are then stored as plaintext).
    expect(startupProblems({ NODE_ENV: "development" }, {}, false)).toEqual([]);
    expect(startupProblems({ NODE_ENV: "test" }, {}, false)).toEqual([]);
  });

  it("refuse a RingCentral webhook without its verification token outside development", () => {
    const url = { RC_WEBHOOK_URL: "https://bayarealandscapingmaterials.com/api/v1/messaging/webhook" };
    expect(startupProblems({ NODE_ENV: "production" }, { ...KEY, ...url }, false)).toEqual([expect.stringContaining("RC_WEBHOOK_TOKEN")]);
    expect(startupProblems({ NODE_ENV: "production" }, { ...KEY, ...url, RC_WEBHOOK_TOKEN: "x".repeat(48) }, false)).toEqual([]);
    expect(startupProblems({ NODE_ENV: "development" }, url, false)).toEqual([]);
  });

  it("stop the process before it serves anything", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const configUrl = pathToFileURL(path.join(here, "config.ts")).href;
    const cwd = mkdtempSync(path.join(tmpdir(), "balm-cfg-")); // no .env files here
    const boot = (extra: NodeJS.ProcessEnv) => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const k of ["VITEST", "NODE_ENV", "SEED_DEMO", "ALLOW_PIN_LOGIN", "INERICA_PRODUCTION", "RC_WEBHOOK_URL", "RC_WEBHOOK_TOKEN", "DATA_ENCRYPTION_KEY"]) delete env[k];
      Object.assign(env, extra);
      return spawnSync(process.execPath, ["--import", tsx, "--input-type=module", "-e", `await import(${JSON.stringify(configUrl)})`], {
        cwd,
        env,
        encoding: "utf8",
      });
    };
    try {
      const refused = boot({ ...KEY, NODE_ENV: "production", SEED_DEMO: "true" });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toMatch(/Refusing to start[\s\S]*SEED_DEMO=true/);
      const host = boot({ NODE_ENV: "development", INERICA_PRODUCTION: "1", SEED_DEMO: "false" });
      expect(host.status).toBe(1);
      expect(host.stderr).toMatch(/NODE_ENV is "development" on a production host/);
      const noKey = boot({ NODE_ENV: "production", SEED_DEMO: "false" });
      expect(noKey.status).toBe(1);
      expect(noKey.stderr).toMatch(/Refusing to start[\s\S]*DATA_ENCRYPTION_KEY/);
      expect(boot({ ...KEY, NODE_ENV: "production", SEED_DEMO: "false", INERICA_PRODUCTION: "1" }).status).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 60_000);
});
