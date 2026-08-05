import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db/prisma";
import { BUILT_IN_WORKFLOWS } from "@/lib/workflows/built-in-workflows";
import { recordAuditEvent } from "@/lib/audit/log";
import { capture } from "@/lib/observability/analytics";
import { recordAuthResult } from "@/lib/observability/metrics";

/** Both signup and login capture the account's provider the same way —
 * a cheap lookup against the oAuthAccount table this app already
 * maintains (see the `account` config above), rather than guessing from
 * fields Better Auth's hook payloads don't expose. */
async function resolveAuthMethod(userId: string): Promise<"email" | "google"> {
  const account = await prisma.oAuthAccount.findFirst({ where: { userId }, select: { provider: true } });
  return account?.provider === "google" ? "google" : "email";
}

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
  // Audit logging (docs/security-hardening/06-audit-logging-design.md):
  // user.create.after and session.create.after are the two hook points
  // Better Auth exposes that map to this app's "authentication" event
  // category — a real sign-up and a real sign-in, respectively. There is
  // no corresponding "failed login" hook exposed by this version of
  // Better Auth to hook into directly; failed-auth signal is instead
  // captured indirectly via the auth route's rate limiter (see
  // app/api/auth/[...all]/route.ts) recording security.rate_limited on
  // repeated failures.
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
          await recordAuditEvent({
            action: "auth.user.registered",
            entityType: "user",
            entityId: user.id,
            userId: user.id,
            organizationId: organization.id,
          });
          const signupMethod = await resolveAuthMethod(user.id);
          capture("user_signed_up", user.id, { signup_method: signupMethod });
          recordAuthResult(true, signupMethod);
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          await recordAuditEvent({
            action: "auth.session.created",
            entityType: "session",
            entityId: session.id,
            userId: session.userId,
            ip: session.ipAddress ?? null,
          });
          const loginMethod = await resolveAuthMethod(session.userId);
          capture("user_logged_in", session.userId, { login_method: loginMethod });
          recordAuthResult(true, loginMethod);
        },
      },
    },
  },

  plugins: [nextCookies()],
});
