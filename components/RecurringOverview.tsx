"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import RecurringList from "@/components/RecurringList";
import RecurringStatistics from "@/components/RecurringStatistics";
import UpcomingPayments from "@/components/UpcomingPayments";
import { detectRecurringTransactions } from "@/lib/recurring/engine";
import { computeRecurringStatistics } from "@/lib/recurring/statistics";
import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import { getTransactions } from "@/lib/storage";
import type { RecurringStatistics as RecurringStatisticsType, RecurringTransaction } from "@/types/recurring";

type SortKey = "nextDue" | "amount" | "merchant" | "frequency" | "confidence" | "status";

const SORT_LABELS: Record<SortKey, string> = {
  nextDue: "Next Due",
  amount: "Amount",
  merchant: "Merchant",
  frequency: "Frequency",
  confidence: "Confidence",
  status: "Status",
};

function sortItems(items: RecurringTransaction[], sortBy: SortKey): RecurringTransaction[] {
  const sorted = [...items];
  switch (sortBy) {
    case "nextDue":
      return sorted.sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
    case "amount":
      return sorted.sort((a, b) => b.averageAmount - a.averageAmount);
    case "merchant":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case "frequency":
      return sorted.sort((a, b) => a.frequency.localeCompare(b.frequency));
    case "confidence":
      return sorted.sort((a, b) => b.confidence - a.confidence);
    case "status":
      return sorted.sort((a, b) => a.status.localeCompare(b.status));
  }
}

export default function RecurringOverview() {
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [stats, setStats] = useState<RecurringStatisticsType | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("nextDue");

  useEffect(() => {
    const transactions = getTransactions();
    const merchantProfiles = getAllMerchantProfiles();
    const { items: recurring } = detectRecurringTransactions(transactions, merchantProfiles);
    setItems(recurring);
    setStats(computeRecurringStatistics(recurring, transactions));
  }, []);

  const sortedItems = useMemo(() => sortItems(items, sortBy), [items, sortBy]);

  return (
    <div className="flex flex-col gap-6">
      {stats && <RecurringStatistics stats={stats} />}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Upcoming</h2>
        <UpcomingPayments items={items} />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">All Recurring Items</h2>
          <Select
            value={sortBy}
            onValueChange={(value) => value && setSortBy(value as SortKey)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  Sort by {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <RecurringList items={sortedItems} />
      </div>
    </div>
  );
}
