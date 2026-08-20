import { defineConfig, devices } from "@playwright/test";

/**
 * Golden-path e2e coverage — the launch-checklist gap noted in
 * docs/production-readiness-v2/08-launch-checklist.md ("no e2e tests").
 * Deliberately minimal: one real-browser walk of sign-up -> dashboard
 * against a real dev server + real database, not a broad suite. Vitest
 * remains the primary test runner for everything else (unit/integration).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // CI runs the production build (already built by the ci.yml build
        // step) — faster and more representative than dev-mode's lazy
        // per-route compilation, which is what made local runs of this
        // suite take 45s+ for a single signup. Local development still
        // uses `next dev` for iteration speed.
        command: process.env.CI ? "npm run start" : "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
