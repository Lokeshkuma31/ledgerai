"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  deleteMerchant,
  getAllMerchants,
  mergeMerchant,
} from "@/lib/merchant/registry";
import { clearMerchantFromTransactions, reassignMerchant } from "@/lib/storage";
import type { Merchant } from "@/types/merchant";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function MergeDialog({
  merchant,
  candidates,
  onMerged,
}: {
  merchant: Merchant;
  candidates: Merchant[];
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
  merchant: Merchant;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);

  function handleDelete() {
    deleteMerchant(merchant.id);
    clearMerchantFromTransactions(merchant.id);
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

function MerchantDetailsDialog({ merchant }: { merchant: Merchant }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            View details
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{merchant.canonicalName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Category Hint</span>
            <span>{merchant.categoryHint ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Transactions</span>
            <span>{merchant.transactionCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Confidence</span>
            <span>{Math.round(merchant.confidence * 100)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">First Seen</span>
            <span>{formatDate(merchant.firstSeen)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last Seen</span>
            <span>{formatDate(merchant.lastSeen)}</span>
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <span className="text-muted-foreground">Aliases</span>
            {merchant.aliases.length === 0 ? (
              <span className="text-muted-foreground text-xs">
                None recorded
              </span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {merchant.aliases.map((alias) => (
                  <span
                    key={alias}
                    className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Close</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MerchantDirectory() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);

  const refresh = useCallback(() => {
    setMerchants(
      [...getAllMerchants()].sort(
        (a, b) => b.transactionCount - a.transactionCount,
      ),
    );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      {merchants.map((merchant) => {
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
              <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt>Category Hint</dt>
                  <dd>{merchant.categoryHint ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Transactions</dt>
                  <dd>{merchant.transactionCount}</dd>
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
              {merchant.aliases.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {merchant.aliases.map((alias) => (
                    <span
                      key={alias}
                      className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <MerchantDetailsDialog merchant={merchant} />
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
      })}
    </div>
  );
}
