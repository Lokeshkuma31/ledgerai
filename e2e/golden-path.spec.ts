import { expect, test } from "@playwright/test";

/**
 * The one golden-path e2e test this app has: sign-up -> auto-provisioned
 * org/membership (lib/auth/better-auth.ts databaseHooks) -> redirect into
 * the authenticated shell. Runs against a real dev server + real database
 * (see playwright.config.ts) — this is intentionally an integration-level
 * check, not a mocked unit test, since the thing worth verifying end-to-end
 * is that auth + provisioning + routing actually connect.
 *
 * Each run signs up a fresh, uniquely-emailed user rather than relying on
 * seeded fixtures, so this is safe to re-run against a shared dev database
 * without colliding with a previous run's account.
 */
test("sign-up redirects into the dashboard with the app shell rendered", async ({ page }) => {
  const uniqueEmail = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@ledgerai.test`;

  await page.goto("/sign-in");

  await page.getByRole("button", { name: /need an account\? sign up/i }).click();

  await page.getByLabel("Name").fill("E2E Golden Path");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password").fill("golden-path-e2e-password");

  await page.getByRole("button", { name: /create account/i }).click();

  // Sign-up does real work server-side (password hash, user/org/membership
  // creation, seeding 4 built-in workflows) against a real remote Neon
  // connection — observed 15s+ in dev mode (uncompiled routes, remote DB
  // round-trip), well above what production would show. Widened rather than
  // asserting a tighter, dev-mode-unrealistic bound.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });

  // Confirms the authenticated app shell actually mounted, not just that the
  // URL changed — the sidebar landmark added in the accessibility pass
  // doubles as a stable, semantic selector here.
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
});
