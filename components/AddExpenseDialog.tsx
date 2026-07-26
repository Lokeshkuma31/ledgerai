"use client";

import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sourceRegistry } from "@/lib/sources";
import type { IngestInput } from "@/lib/sources/ManualSource";
import { PAYMENT_METHODS, type PaymentMethod } from "@/types/transaction";

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AddExpenseDialog({
  onAdd,
}: {
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PAYMENT_METHODS[0],
  );
  const [date, setDate] = useState(todayString);
  const [error, setError] = useState<string | null>(null);
  const [manualEnabled, setManualEnabled] = useState(
    () => sourceRegistry.getSource("manual")?.enabled ?? false,
  );

  function resetForm() {
    setAmount("");
    setNote("");
    setPaymentMethod(PAYMENT_METHODS[0]);
    setDate(todayString());
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      // Re-check on every open — Settings may have toggled this since mount.
      setManualEnabled(sourceRegistry.getSource("manual")?.enabled ?? false);
    }
    setOpen(next);
    if (!next) resetForm();
  }

  const numericAmount = Number(amount);
  const isValid = numericAmount > 0 && note.trim().length > 0;

  async function handleSave() {
    if (!isValid) return;
    setError(null);
    try {
      const manualSource = sourceRegistry.getSource("manual");
      if (!manualSource) {
        throw new Error("Manual Entry source is not registered.");
      }
      const input: IngestInput = {
        amount: numericAmount,
        note,
        paymentMethod,
        date,
      };
      await manualSource.ingest(input);
      onAdd();
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <Button disabled={!manualEnabled}>Add Expense</Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                type="text"
                placeholder="e.g. Coffee with Rahul"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Describe what you spent on. AI will categorize it later.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Payment Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(value) =>
                  setPaymentMethod(value as PaymentMethod)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button onClick={handleSave} disabled={!isValid}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {!manualEnabled && (
        <p className="text-muted-foreground text-xs">
          Manual Entry is disabled.{" "}
          <Link href="/settings/sources" className="hover:underline">
            Enable it in Settings.
          </Link>
        </p>
      )}
    </div>
  );
}
