import { NextResponse } from "next/server";
import { getCurrentMembership, getCurrentSession } from "@/lib/auth/session";
import { UnauthorizedError } from "@/lib/api/errors";
import { handleApiError } from "@/lib/api/error-handler";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

/**
 * Self-service data export (DPDP Act 2023 / GDPR-style right to data
 * portability). Scoped to the tables a user would actually recognize as
 * "my data" — transactions, budgets, goals, recurring rules, bank accounts,
 * and AI Coach conversation history — not every internal operational table
 * (job runs, feed items, notification delivery logs, sync-engine
 * bookkeeping) that exists to run the product rather than represent the
 * user's own financial data. If a future review decides those belong in
 * scope too, this is the one place to extend.
 */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) throw new UnauthorizedError();

    const membership = await getCurrentMembership();
    if (!membership) throw new UnauthorizedError("No workspace found for this account.");

    const organizationId = membership.organizationId;

    const [transactions, budgets, goals, recurringTransactions, bankAccounts, aiConversations, aiMessages] =
      await Promise.all([
        prisma.transaction.findMany({ where: { organizationId } }),
        prisma.budget.findMany({ where: { organizationId } }),
        prisma.goal.findMany({ where: { organizationId } }),
        prisma.recurringTransaction.findMany({ where: { organizationId } }),
        prisma.bankAccount.findMany({ where: { organizationId } }),
        prisma.aIConversation.findMany({ where: { organizationId } }),
        prisma.aIMessage.findMany({ where: { conversation: { organizationId } } }),
      ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      account: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        organizationName: membership.organizationName,
      },
      transactions,
      budgets,
      goals,
      recurringTransactions,
      bankAccounts,
      aiConversations,
      aiMessages,
    };

    logger().info({ userId: session.user.id, organizationId }, "[account] user-initiated data export");

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="ledgerai-export-${organizationId}.json"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
