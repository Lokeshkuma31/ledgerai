import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // The CLI (migrate/seed/studio) needs the unpooled connection — Neon's
    // pooled/pgbouncer endpoint (DATABASE_URL) runs in transaction-pooling
    // mode, which was silently swallowing writes to the _prisma_migrations
    // tracking table. App runtime uses its own pooled connection via the
    // Neon adapter in lib/db/prisma.ts, independent of this config.
    url: process.env.DIRECT_DATABASE_URL,
  },
});
