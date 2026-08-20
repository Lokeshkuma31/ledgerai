import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // The `server-only` package throws by design when resolved outside
      // Next.js's own webpack config (which aliases it to a no-op
      // server-side and to a throwing stub only in the client bundle).
      // Vite/vitest has no equivalent split, so every test run resolves
      // its throwing branch — alias it to a no-op here instead, since
      // every file that imports it is only ever tested in a Node
      // (`@vitest-environment node`) suite, never a real client bundle.
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/*.spec.ts are Playwright tests (real browser, `npm run test:e2e`)
    // — they'd otherwise match Vitest's default *.spec.ts glob too, and
    // @playwright/test's `test` export isn't a Vitest test.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
