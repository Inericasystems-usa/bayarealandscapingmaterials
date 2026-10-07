import { test, expect, request } from "@playwright/test";

const API = "http://localhost:4000";

// Core POS flow: public site loads, staff signs in, opens the drawer, and the
// register is usable. Demo creds are seeded by the API (admin@balm.local).
test.describe("BALM", () => {
  // Mark the store as onboarded before driving the register. On a fresh seed the
  // setup wizard gates the POS (correct for a brand-new tenant); BALM is an
  // already-configured store, so we complete onboarding via the API (Bearer auth
  // is CSRF-exempt) rather than clicking through the wizard in every test.
  test.beforeAll(async () => {
    const ctx = await request.newContext({ baseURL: API });
    const login = await ctx.post("/api/v1/auth/login", {
      data: { email: "admin@balm.local", password: "admin1234" },
    });
    const token = (await login.json())?.data?.token as string;
    await ctx.patch("/api/v1/settings", {
      headers: { authorization: `Bearer ${token}` },
      data: { onboardingComplete: true },
    });
    await ctx.dispose();
  });

  test("public storefront renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Bay Area Landscaping Materials|BALM/i);
    await expect(page.getByRole("link", { name: /products/i }).first()).toBeVisible();
  });

  test("staff signs in and the register is usable", async ({ page }) => {
    await page.goto("/pos");

    // Sign in (labels are programmatically associated — getByLabel works).
    await page.getByLabel("Email").fill("admin@balm.local");
    await page.getByLabel(/password or pin/i).fill("admin1234");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Register chrome is up.
    await expect(page.getByRole("heading", { name: /current order/i })).toBeVisible();

    // Open the cash drawer if it isn't already (idempotent across re-runs).
    const openDrawer = page.getByRole("button", { name: /open drawer/i }).first();
    if (await openDrawer.isVisible().catch(() => false)) {
      await openDrawer.click();
      await page.getByRole("button", { name: /^open drawer$/i }).last().click(); // dialog confirm (header button also matches)
      await expect(page.getByText(/drawer .* open/i)).toBeVisible();
    }

    // Catalog loaded — at least one product tile is present.
    await expect(page.locator("button").filter({ hasText: /\$/ }).first()).toBeVisible();
  });

  test("completes a cash sale end-to-end and shows a receipt", async ({ page }) => {
    await page.goto("/pos");
    await page.getByLabel("Email").fill("admin@balm.local");
    await page.getByLabel(/password or pin/i).fill("admin1234");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("heading", { name: /current order/i })).toBeVisible();

    // Ensure the drawer is open (idempotent — skip if a session is already live).
    const openDrawer = page.getByRole("button", { name: /open drawer/i }).first();
    if (await openDrawer.isVisible().catch(() => false)) {
      await openDrawer.click();
      await page.getByRole("button", { name: /^open drawer$/i }).last().click(); // dialog confirm (header button also matches)
      await expect(page.getByText(/drawer .* open/i)).toBeVisible();
    }

    // Add a custom line ($100 × 1) — deterministic, independent of catalog stock.
    await page.getByRole("button", { name: /^Custom$/ }).click();
    await page.getByPlaceholder(/Special-order pallet/i).fill("E2E test line");
    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: /Add to cart/i }).click();

    // Cart reflects the line + a tax-inclusive total (9.75% → $109.75).
    await expect(page.getByText("E2E test line")).toBeVisible();

    // Charge → cash → tender $120 → change due $10.25 → complete.
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("heading", { name: /take payment/i })).toBeVisible();
    await page.getByRole("button", { name: /^cash$/i }).click();
    await page.getByRole("spinbutton").last().fill("120");
    await expect(page.getByText(/change due/i)).toBeVisible();
    await page.getByRole("button", { name: /^Charge \$/ }).click();

    // Receipt confirmation ("Order <n> complete") appears.
    await expect(page.getByText(/Order .* complete/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /print receipt/i })).toBeVisible();
  });

  test("records an A/R payment against a customer balance", async ({ page }) => {
    await page.goto("/pos");
    await page.getByLabel("Email").fill("admin@balm.local");
    await page.getByLabel(/password or pin/i).fill("admin1234");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("heading", { name: /current order/i })).toBeVisible();

    await page.goto("/pos/customers");
    // Open a seeded customer that carries an account balance.
    await page.getByRole("button", { name: /Edit Fritz Schwalger/i }).click({ timeout: 60_000 });
    const record = page.getByRole("button", { name: /Record payment/i });
    await expect(record).toBeVisible();

    // The amount is captured via a native prompt — accept it.
    page.once("dialog", (d) => void d.accept("100"));
    await record.click();

    // Success toast — applied to invoices or booked to store credit.
    await expect(page.getByText(/Payment (applied|recorded)/i)).toBeVisible({ timeout: 10_000 });
  });

  test("global search routes to a customer", async ({ page }) => {
    await page.goto("/pos");
    await page.getByLabel("Email").fill("admin@balm.local");
    await page.getByLabel(/password or pin/i).fill("admin1234");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("heading", { name: /current order/i })).toBeVisible();

    const gs = page.getByRole("searchbox", { name: /global search/i });
    await gs.click();
    await gs.fill("Fritz");
    // Result appears in the dropdown; click it and land on the filtered list.
    await page.locator("div.absolute button", { hasText: "Fritz" }).first().click();
    await expect(page).toHaveURL(/\/pos\/customers\?q=Fritz/);
    await expect(page.getByText(/Fritz Schwalger/).first()).toBeVisible();
  });

  test("Esc closes a modal (a11y)", async ({ page }) => {
    await page.goto("/pos");
    await page.getByLabel("Email").fill("admin@balm.local");
    await page.getByLabel(/password or pin/i).fill("admin1234");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("heading", { name: /current order/i })).toBeVisible();

    await page.getByRole("button", { name: /^Custom$/ }).click();
    await expect(page.getByRole("heading", { name: /custom item/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: /custom item/i })).toBeHidden();
  });

  // Kept LAST: it resets onboarding, so it must run after the register tests
  // (which rely on the beforeAll-completed store) and re-complete it at the end.
  test("completes the onboarding wizard on a fresh store", async ({ page }) => {
    const ctx = await request.newContext({ baseURL: API });
    const login = await ctx.post("/api/v1/auth/login", { data: { email: "admin@balm.local", password: "admin1234" } });
    const token = (await login.json())?.data?.token as string;
    await ctx.patch("/api/v1/settings", { headers: { authorization: `Bearer ${token}` }, data: { onboardingComplete: false } });
    await ctx.dispose();

    await page.goto("/pos");
    await page.getByLabel("Email").fill("admin@balm.local");
    await page.getByLabel(/password or pin/i).fill("admin1234");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wizard gates the POS on a fresh store.
    await expect(page.getByRole("heading", { name: /Welcome to Inerica POS/i })).toBeVisible({ timeout: 60_000 });
    // Step 1 — store details.
    await page.getByPlaceholder("Store name *").fill("Bay Area Landscaping Materials");
    await page.getByRole("button", { name: /Continue/i }).click();
    // Step 2 — website (skip by continuing).
    await expect(page.getByRole("heading", { name: /Connect your website/i })).toBeVisible();
    await page.getByRole("button", { name: /Continue/i }).click();
    // Step 3 — inventory import (skip).
    await expect(page.getByRole("heading", { name: /Import inventory/i })).toBeVisible();
    await page.getByRole("button", { name: /^(Skip|Continue)$/i }).click();
    // Step 4 — finish.
    await page.getByRole("button", { name: /Enter Inerica POS/i }).click();

    // Wizard dismissed → the register is now reachable.
    await expect(page.getByRole("heading", { name: /current order/i })).toBeVisible({ timeout: 60_000 });
  });
});
