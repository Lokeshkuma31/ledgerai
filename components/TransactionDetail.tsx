"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/DashboardProvider";
import CategoryIcon from "@/components/shared/CategoryIcon";
import MerchantAvatar from "@/components/shared/MerchantAvatar";
import ClassificationSourceBadge from "@/components/ClassificationSourceBadge";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import ReviewTransactionDialog from "@/components/ReviewTransactionDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isIncomeTransaction } from "@/lib/forecast/calculator";
import { getTransactions, reviewTransaction } from "@/lib/storage";
import type { Category, Transaction } from "@/types/transaction";

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function categoryOf(t: Transaction): string {
  return t.userCategory ?? t.aiCategory ?? "Other";
}

function merchantOf(t: Transaction): string {
  return t.merchantName ?? t.note ?? "Unrecognized";
}

/**
 * The transaction detail route — previously the only way to see a
 * transaction's full context was the ReviewTransactionDialog modal, with no
 * deep-linkable page. Attachments are intentionally not shown here:
 * Transaction carries no ingestion-source or attachment link today (email
 * attachments are a separate, unrelated data model), so rendering them
 * would be fabricated rather than sourced from real data.
 */
export default function TransactionDetail({ transactionId }: { transactionId: string }) {
  const { refresh } = useDashboard();
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    setTransactions(getTransactions());
  }, []);

  const transaction = useMemo(
    () => transactions?.find((t) => t.id === transactionId) ?? null,
    [transactions, transactionId],
  );

  const related = useMemo(() => {
    if (!transaction || !transactions) return [];
    const category = categoryOf(transaction);
    const cutoff = new Date(transaction.date);
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return transactions
      .filter((t) => t.id !== transaction.id)
      .filter((t) =>
        transaction.merchantId
          ? t.merchantId === transaction.merchantId
          : categoryOf(t) === category && t.date >= cutoffStr,
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [transaction, transactions]);

  function handleReview(id: string, userCategory?: Category) {
    setTransactions(reviewTransaction(id, userCategory));
    refresh();
  }

  if (transactions === null) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (!transaction) {
    return (
      <p className="text-muted-foreground text-sm">
        Transaction not found — it may have been merged or deleted.{" "}
        <Link href="/transactions" className="hover:underline">
          Back to Transactions
        </Link>
      </p>
    );
  }

  const income = isIncomeTransaction(transaction);
  const name = merchantOf(transaction);
  const category = categoryOf(transaction);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-4">
          <MerchantAvatar name={name} size="lg" />
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold tracking-tight">{name}</span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <CategoryIcon category={category} />
              {category} · {formatDate(transaction.date)}
            </span>
          </div>
        </div>
        <span className={`font-numeric text-3xl font-semibold ${income ? "text-success" : ""}`}>
          {income ? "+" : ""}₹{Math.round(transaction.amount).toLocaleString("en-IN")}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {transaction.confidence !== undefined && <ConfidenceBadge confidence={transaction.confidence} />}
        {transaction.classificationSource && (
          <ClassificationSourceBadge source={transaction.classificationSource} />
        )}
        <Badge variant="outline">{transaction.paymentMethod}</Badge>
        <Badge variant={transaction.reviewed ? "secondary" : "outline"}>
          {transaction.reviewed ? "Reviewed" : "Needs Review"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Original note</span>
            <p className="text-sm">{transaction.note || "—"}</p>
          </div>
          <div className="flex justify-end">
            <ReviewTransactionDialog transaction={transaction} onReview={handleReview} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Related Transactions</h2>
        {related.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No related transactions {transaction.merchantId ? "from this merchant" : "in this category"} recently.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {related.map((t) => (
              <Link key={t.id} href={`/transactions/${t.id}`}>
                <Card size="sm" className="hover:ring-primary/30 transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <MerchantAvatar name={merchantOf(t)} size="sm" />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{merchantOf(t)}</span>
                        <span className="text-muted-foreground text-xs">{formatDate(t.date)}</span>
                      </div>
                    </div>
                    <span className="font-numeric shrink-0 text-sm font-semibold">
                      ₹{Math.round(t.amount).toLocaleString("en-IN")}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
