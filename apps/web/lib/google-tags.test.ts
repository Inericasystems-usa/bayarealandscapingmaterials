import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_ADS_IDS, GOOGLE, isAllowedAdsTarget } from "./google-tags";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every source file the site is built from. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(tsx?|mjs|js)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

describe("Google Ads accounts", () => {
  it("allow exactly the one BALM account", () => {
    expect(ALLOWED_ADS_IDS).toEqual(["AW-18242325959"]);
    expect(isAllowedAdsTarget(`${GOOGLE.adsConversionId}/${GOOGLE.conversionLabels.quoteFormLead}`)).toBe(true);
    expect(isAllowedAdsTarget("AW-18488088344/abc")).toBe(false);
  });

  it("no other Ads account id is written anywhere in the site's code", () => {
    const found = new Set<string>();
    for (const dir of ["app", "components", "lib"]) {
      for (const file of sourceFiles(path.join(WEB_ROOT, dir))) {
        if (file.endsWith(path.join("lib", "google-tags.ts"))) continue; // documents the stray one
        for (const m of readFileSync(file, "utf8").matchAll(/AW-\d{6,}/g)) found.add(m[0]);
      }
    }
    expect([...found].filter((id) => !ALLOWED_ADS_IDS.includes(id))).toEqual([]);
  });
});

describe("contact form conversion label", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is null until NEXT_PUBLIC_ADS_CONTACT_LABEL is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADS_CONTACT_LABEL", "");
    vi.resetModules();
    expect((await import("./google-tags")).GOOGLE.conversionLabels.contactFormLead).toBeNull();
  });

  it("comes from the environment, and a malformed value is ignored", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADS_CONTACT_LABEL", "AbC-12_xyz");
    vi.resetModules();
    expect((await import("./google-tags")).GOOGLE.conversionLabels.contactFormLead).toBe("AbC-12_xyz");

    vi.stubEnv("NEXT_PUBLIC_ADS_CONTACT_LABEL", "'</script><script>alert(1)//");
    vi.resetModules();
    expect((await import("./google-tags")).GOOGLE.conversionLabels.contactFormLead).toBeNull();
  });

  it("rides on the contact event once set", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADS_CONTACT_LABEL", "AbC-12_xyz");
    vi.resetModules();
    const layer: Record<string, unknown>[] = [];
    vi.stubGlobal("window", { dataLayer: layer });
    const { trackContactFormSubmitted } = await import("./analytics");
    trackContactFormSubmitted({ leadId: "lead_1", userData: {} });
    expect(layer).toEqual([
      { event: "contact_form_submitted", lead_id: "lead_1", user_data: {}, ads_conversion_label: "AbC-12_xyz" },
    ]);
    vi.unstubAllGlobals();
  });
});
