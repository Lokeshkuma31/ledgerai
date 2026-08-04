import path from "node:path";
import { defineConfig } from "vitest/config";

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
  },
});
