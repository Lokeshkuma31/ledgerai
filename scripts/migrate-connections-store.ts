/**
 * One-time migration: reads the old file-backed Connection Hub store
 * (`.connections-data/store.json`, if present) and inserts each record
 * into Postgres via the Connection repository — per the plan's Phase 2,
 * "Connection Hub first among domain modules."
 *
 * The old store predates real user accounts (Better Auth), so it has no
 * `userId` on its records — every migrated connection is assigned to the
 * first user in the database (there should only be one, since this
 * script is meant to run once, early, before multiple real users exist).
 * Run with: npx tsx scripts/migrate-connections-store.ts
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

async function main() {
  const storeFile = path.join(process.cwd(), ".connections-data", "store.json");
  if (!fs.existsSync(storeFile)) {
    console.log("No .connections-data/store.json found — nothing to migrate.");
    return;
  }

  const { prisma } = await import("../lib/db/prisma");
  const { upsertStoredConnection } = await import("../lib/connections/registry");

  const raw = fs.readFileSync(storeFile, "utf8");
  const records: Array<Record<string, unknown>> = JSON.parse(raw);
  if (!Array.isArray(records) || records.length === 0) {
    console.log("Store file is empty — nothing to migrate.");
    return;
  }

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error("No User rows exist yet — sign up at least one user (or run `prisma db seed`) before migrating connections.");
  }

  let migrated = 0;
  for (const record of records) {
    await upsertStoredConnection({
      id: record.id as string,
      userId: user.id,
      provider: record.provider as "google" | "microsoft" | "yahoo",
      providerAccountId: record.providerAccountId as string,
      displayName: record.displayName as string,
      email: record.email as string,
      status: record.status as never,
      connectedAt: record.connectedAt as string,
      lastValidated: (record.lastValidated as string | null) ?? null,
      lastActivity: record.lastActivity as string,
      tokens: (record.tokens as never) ?? null,
      health: record.health as never,
      history: (record.history as never[]) ?? [],
      metadata: (record.metadata as Record<string, unknown>) ?? {},
    });
    migrated += 1;
  }

  console.log(`Migrated ${migrated} connection(s) to Postgres, assigned to user ${user.email}.`);
  console.log(`You can now delete ${storeFile} (it's gitignored and no longer read by the app).`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
