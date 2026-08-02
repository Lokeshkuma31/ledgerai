"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useDashboard } from "@/components/DashboardProvider";
import ReviewTransactionDialog from "@/components/ReviewTransactionDialog";
import CategoryIcon from "@/components/shared/CategoryIcon";
import MerchantAvatar from "@/components/shared/MerchantAvatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isIncomeTransaction } from "@/lib/forecast/calculator";
import { getTransactions, reviewTransaction } from "@/lib/storage";
import type { Category, Transaction } from "@/types/transaction";

type SortKey = "date" | "merchant" | "category" | "amount";
type SortDir = "asc" | "desc";
type Filter = "all" | "income" | "expense" | "pending";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "income", label: "Income" },
  { id: "expense", label: "Expenses" },
  { id: "pending", label: "Pending Review" },
];

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function categoryOf(t: Transaction): string {
  return t.userCategory ?? t.aiCategory ?? "Other";
}

function merchantOf(t: Transaction): string {
  return t.merchantName ?? t.note ?? "Unrecognized";
}

export default function TransactionsTable() {
  const { refresh } = useDashboard();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  useEffect(() => setTransactions(getTransactions()), []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleReview(id: string, userCategory?: Category) {
    setTransactions(reviewTransaction(id, userCategory));
    refresh();
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = transactions.filter((t) => {
      if (filter === "income" && !isIncomeTransaction(t)) return false;
      if (filter === "expense" && isIncomeTransaction(t)) return false;
      if (filter === "pending" && t.reviewed) return false;
      if (!q) return true;
      return (
        merchantOf(t).toLowerCase().includes(q) ||
        categoryOf(t).toLowerCase().includes(q) ||
        t.note.toLowerCase().includes(q)
      );
    });

    const dir = sortDir === "asc" ? 1 : -1;
    filtered = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "amount":
          return (a.amount - b.amount) * dir;
        case "merchant":
          return merchantOf(a).localeCompare(merchantOf(b)) * dir;
        case "category":
          return categoryOf(a).localeCompare(categoryOf(b)) * dir;
        default:
          return (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)) * dir;
      }
    });

    return filtered;
  }, [transactions, search, filter, sortKey, sortDir]);

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ArrowUpDown className="text-foreground-subtle size-3" />;
    return sortDir === "asc" ? <ArrowUp className="text-primary size-3" /> : <ArrowDown className="text-primary size-3" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="text-foreground-subtle absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={
                filter === f.id
                  ? "bg-primary rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 rounded-lg border px-3 py-1.5 text-xs font-semibold"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-border overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-2 hover:bg-surface-2">
              <TableHead>
                <button type="button" onClick={() => toggleSort("date")} className="flex cursor-pointer items-center gap-1.5">
                  Date <SortIcon column="date" />
                </button>
              </TableHead>
              <TableHead>
                <button type="button" onClick={() => toggleSort("merchant")} className="flex cursor-pointer items-center gap-1.5">
                  Merchant <SortIcon column="merchant" />
                </button>
              </TableHead>
              <TableHead>
                <button type="button" onClick={() => toggleSort("category")} className="flex cursor-pointer items-center gap-1.5">
                  Category <SortIcon column="category" />
                </button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">
                <button type="button" onClick={() => toggleSort("amount")} className="ml-auto flex cursor-pointer items-center gap-1.5">
                  Amount <SortIcon column="amount" />
                </button>
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center">
                  <p className="text-foreground text-sm font-medium">No transactions found</p>
                  <p className="text-muted-foreground text-xs">Try a different search term or filter.</p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((t) => {
                const income = isIncomeTransaction(t);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-numeric text-muted-foreground">{formatDate(t.date)}</TableCell>
                    <TableCell>
                      <Link href={`/transactions/${t.id}`} className="flex items-center gap-2.5 hover:underline">
                        <MerchantAvatar name={merchantOf(t)} size="sm" />
                        <div className="flex flex-col">
                          <span className="font-medium">{merchantOf(t)}</span>
                          <span className="text-muted-foreground text-xs">{t.paymentMethod}</span>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <CategoryIcon category={categoryOf(t)} />
                        {categoryOf(t)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.reviewed ? "secondary" : "outline"}>
                        {t.reviewed ? "Reviewed" : "Needs Review"}
                      </Badge>
                    </TableCell>
                    <TableCell className={`font-numeric text-right font-semibold ${income ? "text-success" : ""}`}>
                      {income ? "+" : ""}₹{Math.round(t.amount).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <ReviewTransactionDialog transaction={t} onReview={handleReview} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground text-xs">
        Showing {rows.length} of {transactions.length} transactions
      </p>
    </div>
  );
}
