import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { BUILT_IN_WORKFLOWS } from "../lib/workflows/built-in-workflows";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedBuiltInWorkflows(organizationId: string) {
  await Promise.all(
    BUILT_IN_WORKFLOWS.map((workflow) =>
      prisma.workflowDefinition.upsert({
        where: { organizationId_key: { organizationId, key: workflow.key } },
        update: {
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger,
          steps: JSON.parse(JSON.stringify(workflow.steps)),
          priority: workflow.priority,
        },
        create: {
          key: workflow.key,
          organizationId,
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger,
          steps: JSON.parse(JSON.stringify(workflow.steps)),
          priority: workflow.priority,
        },
      }),
    ),
  );
}

// Mirrors CATEGORIES in types/transaction.ts exactly (the app's real,
// existing 11-category taxonomy) — this seed becomes the new source of
// truth replacing "seed on first localStorage read". `key` is the
// lowercase slug used for lookups; `label` is CATEGORIES' verbatim string.
const CATEGORIES = [
  { key: "food", label: "Food" },
  { key: "transport", label: "Transport" },
  { key: "shopping", label: "Shopping" },
  { key: "bills", label: "Bills" },
  { key: "entertainment", label: "Entertainment" },
  { key: "health", label: "Health" },
  { key: "education", label: "Education" },
  { key: "travel", label: "Travel" },
  { key: "salary", label: "Salary" },
  { key: "transfer", label: "Transfer" },
  { key: "other", label: "Other" },
];

const PLUGIN_REGISTRY_ENTRIES = [
  {
    id: "document-intelligence",
    name: "Document Intelligence",
    version: "0.1.0",
    author: "LedgerAI",
    capabilities: ["transaction-source", "document-processor"],
  },
  {
    id: "account-aggregator",
    name: "Account Aggregator",
    version: "0.1.0",
    author: "LedgerAI",
    capabilities: ["transaction-source", "bank-sync"],
  },
  {
    id: "android-sms",
    name: "Android SMS & Notifications",
    version: "0.1.0",
    author: "LedgerAI",
    capabilities: ["transaction-source"],
  },
  {
    id: "gmail-connector",
    name: "Gmail Connector",
    version: "0.1.0",
    author: "LedgerAI",
    capabilities: ["transaction-source", "email-import"],
  },
] as const;

const FEATURE_FLAGS = [
  { key: "connections.yahoo", description: "Enable the Yahoo Mail data-source connection.", defaultOn: false },
  { key: "documents.realOcr", description: "Use a real OCR provider instead of the mock provider.", defaultOn: false },
  { key: "search.pgvector", description: "Enable pgvector-backed semantic search alongside Postgres FTS.", defaultOn: false },
] as const;

async function seedCore() {
  await Promise.all(
    CATEGORIES.map((category) =>
      prisma.category.upsert({
        where: { key: category.key },
        update: { label: category.label },
        create: category,
      }),
    ),
  );

  await Promise.all(
    PLUGIN_REGISTRY_ENTRIES.map((entry) =>
      prisma.pluginRegistryEntry.upsert({
        where: { id: entry.id },
        update: { name: entry.name, version: entry.version, author: entry.author, capabilities: [...entry.capabilities] },
        create: {
          id: entry.id,
          name: entry.name,
          version: entry.version,
          author: entry.author,
          capabilities: [...entry.capabilities],
          dependencies: [],
          status: "healthy",
          health: { status: "healthy", message: "Seeded, not yet run.", checkedAt: new Date().toISOString() },
        },
      }),
    ),
  );

  await Promise.all(
    FEATURE_FLAGS.map((flag) =>
      prisma.featureFlag.upsert({
        where: { key: flag.key },
        update: { description: flag.description, defaultOn: flag.defaultOn },
        create: flag,
      }),
    ),
  );
}

async function seedDemoData() {
  const email = "demo@ledgerai.local";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Demo User", emailVerified: true },
  });

  const existingMembership = await prisma.membership.findFirst({ where: { userId: user.id } });
  let organizationId: string;
  if (existingMembership) {
    organizationId = existingMembership.organizationId;
  } else {
    const organization = await prisma.organization.create({ data: { name: "Demo User's Workspace", isPersonal: true } });
    await prisma.membership.create({ data: { userId: user.id, organizationId: organization.id, role: "OWNER" } });
    organizationId = organization.id;
  }

  await seedBuiltInWorkflows(organizationId);

  // A handful of demo transactions so local dev / preview smoke tests have
  // something to look at immediately.
  const foodCategory = await prisma.category.findUniqueOrThrow({ where: { key: "food" } });
  const transportCategory = await prisma.category.findUniqueOrThrow({ where: { key: "transport" } });

  const existingTxCount = await prisma.transaction.count({ where: { organizationId } });
  if (existingTxCount === 0) {
    await prisma.transaction.createMany({
      data: [
        {
          organizationId,
          amount: "450.00",
          note: "Swiggy order",
          paymentMethod: "UPI",
          userCategoryId: foodCategory.id,
          reviewed: true,
          date: new Date(),
        },
        {
          organizationId,
          amount: "120.00",
          note: "Uber ride",
          paymentMethod: "UPI",
          userCategoryId: transportCategory.id,
          reviewed: true,
          date: new Date(),
        },
      ],
    });
  }
}

async function main() {
  await seedCore();

  if (process.env.NODE_ENV !== "production" && process.env.SEED_DEMO_DATA !== "false") {
    await seedDemoData();
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
