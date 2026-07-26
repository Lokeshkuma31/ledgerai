"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MerchantDirectoryFilters, {
  type MerchantDirectoryFilterState,
} from "@/components/MerchantDirectoryFilters";
import MerchantKnowledgeBadge from "@/components/MerchantKnowledgeBadge";
import {
  getAllMerchantProfiles,
  refreshMerchantKnowledge,
  removeMerchantKnowledge,
} from "@/lib/merchant/knowledge";
import { deleteMerchant, mergeMerchant } from "@/lib/merchant/registry";
import { clearMerchantFromTransactions, reassignMerchant } from "@/lib/storage";
import type { MerchantProfile } from "@/types/merchant-profile";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function MergeDialog({
  merchant,
  candidates,
  onMerged,
}: {
  merchant: MerchantProfile;
  candidates: MerchantProfile[];
  onMerged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState(candidates[0]?.id ?? "");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setTargetId(candidates[0]?.id ?? "");
  }

  function handleMerge() {
    const target = candidates.find((c) => c.id === targetId);
    if (!target) return;
    mergeMerchant(merchant.id, target.id);
    reassignMerchant(merchant.id, target.id, target.canonicalName);
    removeMerchantKnowledge(merchant.id);
    refreshMerchantKnowledge(target.id);
    setOpen(false);
    onMerged();
  }

  if (candidates.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Merge
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Merge &ldquo;{merchant.canonicalName}&rdquo; into…
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <p className="text-muted-foreground text-sm">
            All {merchant.transactionCount} transaction(s) and aliases move
            to the merchant you pick below. &ldquo;{merchant.canonicalName}
            &rdquo; is then removed.
          </p>
          <Select
            value={targetId}
            onValueChange={(value) => setTargetId(value ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.canonicalName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button onClick={handleMerge} disabled={!targetId}>
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  merchant,
  onDeleted,
}: {
  merchant: MerchantProfile;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);

  function handleDelete() {
    deleteMerchant(merchant.id);
    clearMerchantFromTransactions(merchant.id);
    removeMerchantKnowledge(merchant.id);
    setOpen(false);
    onDeleted();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm">
            Delete
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{merchant.canonicalName}&rdquo;?</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          {merchant.transactionCount} transaction(s) will keep their amount,
          note, and category, but lose their merchant tag.
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_FILTERS: MerchantDirectoryFilterState = {
  search: "",
  sortBy: "transactions",
  category: "all",
  industry: "all",
};

export default function MerchantDirectory() {
  const [merchants, setMerchants] = useState<MerchantProfile[]>([]);
  const [filters, setFilters] = useState<MerchantDirectoryFilterState>(DEFAULT_FILTERS);

  const refresh = useCallback(() => {
    setMerchants(getAllMerchantProfiles());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const categories = useMemo(
    () => Array.from(new Set(merchants.map((m) => m.defaultCategory))).sort(),
    [merchants],
  );
  const industries = useMemo(
    () => Array.from(new Set(merchants.map((m) => m.industry))).sort(),
    [merchants],
  );

  const visibleMerchants = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const filtered = merchants.filter((m) => {
      if (
        search &&
        !m.canonicalName.toLowerCase().includes(search) &&
        !m.aliases.some((alias) => alias.toLowerCase().includes(search))
      ) {
        return false;
      }
      if (filters.category !== "all" && m.defaultCategory !== filters.category) {
        return false;
      }
      if (filters.industry !== "all" && m.industry !== filters.industry) {
        return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) =>
      filters.sortBy === "spend"
        ? b.totalSpend - a.totalSpend
        : b.transactionCount - a.transactionCount,
    );
  }, [merchants, filters]);

  if (merchants.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">
            No merchants identified yet. Add a transaction whose note
            mentions a merchant (e.g. &ldquo;Coffee at Starbucks&rdquo;) to
            see it here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <MerchantDirectoryFilters
        state={filters}
        categories={categories}
        industries={industries}
        onChange={setFilters}
      />
      {visibleMerchants.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">
              No merchants match these filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        visibleMerchants.map((merchant) => {
          const candidates = merchants.filter((m) => m.id !== merchant.id);
          return (
            <Card key={merchant.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-base">
                  {merchant.canonicalName}
                </CardTitle>
                <span className="text-muted-foreground text-xs">
                  {Math.round(merchant.confidence * 100)}% confidence
                </span>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1">
                  <MerchantKnowledgeBadge label={merchant.industry} />
                  <MerchantKnowledgeBadge label={merchant.defaultCategory} tone="muted" />
                  {merchant.isRecurringFriendly && (
                    <MerchantKnowledgeBadge label="Recurring" tone="muted" />
                  )}
                </div>
                <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt>Transactions</dt>
                    <dd>{merchant.transactionCount}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Total Spend</dt>
                    <dd>{formatAmount(merchant.totalSpend)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>First Seen</dt>
                    <dd>{formatDate(merchant.firstSeen)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Last Seen</dt>
                    <dd>{formatDate(merchant.lastSeen)}</dd>
                  </div>
                </dl>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/merchants/${merchant.id}`} />}
                  >
                    View details
                  </Button>
                  <MergeDialog
                    merchant={merchant}
                    candidates={candidates}
                    onMerged={refresh}
                  />
                  <DeleteDialog merchant={merchant} onDeleted={refresh} />
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
