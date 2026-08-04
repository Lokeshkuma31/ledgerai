import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db/prisma";
import { BUILT_IN_WORKFLOWS } from "@/lib/workflows/built-in-workflows";

// Better Auth is exclusively user identity/login. It is intentionally kept
// separate from the Connection Hub (lib/connections/*), which is OAuth for
// connecting Gmail/Outlook/Yahoo as DATA SOURCES, not for signing in — the
// two never share tokens or a Google OAuth client, even though both may
// target Google (see plan §4, §9).
const googleClientId = process.env.BETTER_AUTH_GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
  },

  ...(googleClientId && googleClientSecret
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        },
      }
    : {}),

  // Our OAuthAccount table's field names diverge from Better Auth's core
  // "account" schema (provider/providerAccountId vs providerId/accountId) —
  // this reconciles the naming without adding duplicate columns.
  account: {
    modelName: "oAuthAccount",
    fields: {
      providerId: "provider",
      accountId: "providerAccountId",
    },
  },

  // Every new user gets an implicit personal Organization + OWNER
  // Membership so single-user mode works today without blocking future
  // team support (plan §2, §9) — this is the production successor to
  // "this app has no user-account system, assumes a single local user."
  //
  // The 4 built-in workflows (lib/workflows/built-in-workflows.ts) are
  // seeded here too — that module's own doc comment already documents
  // this as the real sign-up path (prisma/seed.ts's seedBuiltInWorkflows
  // only covers the dev/preview demo org, not real sign-ups).
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const organization = await prisma.organization.create({
            data: {
              name: `${user.name ?? user.email}'s Workspace`,
              isPersonal: true,
              memberships: {
                create: { userId: user.id, role: "OWNER" },
              },
            },
          });
          await Promise.all(
            BUILT_IN_WORKFLOWS.map((workflow) =>
              prisma.workflowDefinition.create({
                data: {
                  key: workflow.key,
                  organizationId: organization.id,
                  name: workflow.name,
                  description: workflow.description,
                  trigger: workflow.trigger,
                  steps: JSON.parse(JSON.stringify(workflow.steps)),
                  priority: workflow.priority,
                },
              }),
            ),
          );
        },
      },
    },
  },

  plugins: [nextCookies()],
});
