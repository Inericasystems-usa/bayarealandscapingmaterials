import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";

/**
 * Public-site quality gate. Runs against a production build with no API
 * (CI job "site-quality": next build && next start, PW_BASE_URL set), so it
 * checks what visitors actually get:
 *
 *  - nothing sticks out sideways on a phone (320 and 390 px);
 *  - no serious or critical axe (WCAG 2.2 AA) violations, phone and desktop;
 *  - one H1, a title and a meta description on every page;
 *  - no cookies and consent "denied" until the visitor answers the banner;
 *  - no dev-server leftovers in the HTML.
 *
 * Add a page here when you add one to the site.
 */
const PAGES = [
  "/",
  "/products",
  "/products/black-bark",
  "/products/category/bark-mulch",
  "/tools",
  "/calculator",
  "/yard-size-guide",
  "/delivery",
  "/service-area",
  "/gallery",
  "/about",
  "/faq",
  "/contact",
  "/request-quote",
  "/privacy-policy",
  "/terms-of-service",
  "/returns",
];

const PHONES = [320, 390];

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
}

/** Visible elements that extend past either side of the viewport. */
async function sidewaysOverflow(page: Page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const scrollers = "[class*=overflow-x-auto],[class*=overflow-hidden],[class*=snap-x],.sr-only";
    return [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        if (el.closest(scrollers)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.right > W + 1 || r.left < -1);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
  });
}

for (const path of PAGES) {
  test.describe(path, () => {
    for (const width of PHONES) {
      test(`fits a ${width}px phone`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path, { waitUntil: "networkidle" });
        await scrollThrough(page);
        expect(await sidewaysOverflow(page)).toEqual([]);
        const { scroll, client } = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(scroll).toBeLessThanOrEqual(client);
      });
    }

    for (const [name, size] of [
      ["phone", { width: 390, height: 844 }],
      ["desktop", { width: 1440, height: 900 }],
    ] as const) {
      test(`no serious accessibility violations (${name})`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto(path, { waitUntil: "networkidle" });
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        const blocking = violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => `${v.id} (${v.nodes.length})`);
        expect(blocking).toEqual([]);
      });
    }

    test("has one H1, a title and a description", async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
      expect((await page.title()).length).toBeGreaterThan(10);
      const description = await page.locator('meta[name="description"]').first().getAttribute("content");
      expect(description?.length ?? 0).toBeGreaterThan(50);
    });
  });
}

test("no tracking before the visitor answers the cookie banner", async ({ page, context }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  expect(await context.cookies()).toEqual([]);
  const consent = await page.evaluate(() =>
    ((window as unknown as { dataLayer?: unknown[][] }).dataLayer ?? []).find(
      (e) => e?.[0] === "consent" && e?.[1] === "default",
    ),
  );
  if (consent) {
    expect(consent[2]).toMatchObject({ ad_storage: "denied", analytics_storage: "denied" });
  }
  await expect(page.getByRole("button", { name: /reject all/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /accept all/i })).toBeVisible();
});

test("production HTML carries no dev-server leftovers", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).not.toContain("jsxDEV");
  expect(html).not.toMatch(/\/(var\/www|home\/[a-z]+)\//);
  expect(html).not.toContain("localhost:3000");
});
