"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIES,
  type Category,
  type Transaction,
} from "@/types/transaction";

export default function ReviewTransactionDialog({
  transaction,
  onReview,
}: {
  transaction: Transaction;
  onReview: (id: string, userCategory?: Category) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category>(
    transaction.userCategory ??
      (transaction.aiCategory as Category) ??
      CATEGORIES[0],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSelectedCategory(
        transaction.userCategory ??
          (transaction.aiCategory as Category) ??
          CATEGORIES[0],
      );
    }
  }

  function handleAccept() {
    onReview(transaction.id);
    setOpen(false);
  }

  function handleSaveCorrection() {
    onReview(transaction.id, selectedCategory);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Review
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review Transaction</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">
              ₹{transaction.amount.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-sm">Original Note</span>
            <p className="text-sm">{transaction.note}</p>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">AI Category</span>
            <span className="font-medium">{transaction.aiCategory ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-medium">
              {transaction.confidence !== undefined
                ? `${Math.round(transaction.confidence * 100)}%`
                : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 pt-2">
            <Label>Category</Label>
            <Select
              value={selectedCategory}
              onValueChange={(value) => setSelectedCategory(value as Category)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button variant="outline" onClick={handleAccept}>
            Accept AI Category
          </Button>
          <Button onClick={handleSaveCorrection}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
