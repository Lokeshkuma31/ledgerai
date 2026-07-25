"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import AddExpenseDialog from "@/components/AddExpenseDialog";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import DashboardSummary from "@/components/DashboardSummary";
import InsightsSummary from "@/components/InsightsSummary";
import TimelineSection from "@/components/TimelineSection";
import { generateInsights } from "@/lib/insights/engine";
import { generateTimeline } from "@/lib/timeline/engine";
import {
  addTransaction,
  getTransactions,
  reviewTransaction,
} from "@/lib/storage";
import type { Category, Transaction } from "@/types/transaction";

export default function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    setTransactions(getTransactions());
  }, []);

  function handleAdd(transaction: Transaction) {
    setTransactions(addTransaction(transaction));
  }

  function handleReview(id: string, userCategory?: Category) {
    setTransactions(reviewTransaction(id, userCategory));
  }

  const insights = generateInsights(transactions);
  const timeline = generateTimeline(transactions);

  return (
    <div className="flex flex-col gap-4">
      {transactions.length > 0 && (
        <DashboardSummary transactions={transactions} />
      )}
      <div className="flex justify-end">
        <AddExpenseDialog onAdd={handleAdd} />
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Insights</h2>
        {transactions.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-muted-foreground">
                No insights available yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <InsightsSummary insights={insights} />
            <CategoryBreakdown breakdown={insights.categoryBreakdown} />
          </>
        )}
      </div>
      {transactions.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">No transactions yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {timeline.map((group) => (
            <TimelineSection
              key={group.key}
              group={group}
              onReview={handleReview}
            />
          ))}
        </div>
      )}
    </div>
  );
}
