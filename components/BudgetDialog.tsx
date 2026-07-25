"use client";

import { type ReactElement, useState } from "react";
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
import {
  addBudget,
  deleteBudget,
  updateBudgetLimit,
} from "@/lib/budget/storage";
import { CATEGORIES, type Category } from "@/types/transaction";
import type { Budget } from "@/types/budget";

type BudgetDialogProps =
  | {
      mode: "create";
      existingCategories: Category[];
      onSave: (budgets: Budget[]) => void;
      trigger: ReactElement;
    }
  | {
      mode: "edit";
      budgetId: string;
      category: Category;
      currentLimit: number;
      onSave: (budgets: Budget[]) => void;
      trigger: ReactElement;
    };

export default function BudgetDialog(props: BudgetDialogProps) {
  const availableCategories =
    props.mode === "create"
      ? CATEGORIES.filter((c) => !props.existingCategories.includes(c))
      : [];

  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(
    props.mode === "edit" ? String(props.currentLimit) : "",
  );
  const [category, setCategory] = useState<Category | "">(
    props.mode === "edit" ? props.category : (availableCategories[0] ?? ""),
  );
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setError(null);
    if (props.mode === "edit") {
      setLimit(String(props.currentLimit));
      setCategory(props.category);
    } else {
      setLimit("");
      setCategory(availableCategories[0] ?? "");
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  const numericLimit = Number(limit);
  const isValid = numericLimit > 0 && category !== "";

  function handleSave() {
    if (!isValid) return;
    setError(null);
    try {
      const updated =
        props.mode === "create"
          ? addBudget(category as Category, numericLimit)
          : updateBudgetLimit(props.budgetId, numericLimit);
      props.onSave(updated);
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function handleDelete() {
    if (props.mode !== "edit") return;
    const updated = deleteBudget(props.budgetId);
    props.onSave(updated);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={props.trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.mode === "create" ? "Create Budget" : "Edit Budget"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            {props.mode === "edit" ? (
              <p className="text-sm font-medium">{props.category}</p>
            ) : availableCategories.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Every category already has a budget.
              </p>
            ) : (
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as Category)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthlyLimit">Monthly Limit</Label>
            <Input
              id="monthlyLimit"
              type="number"
              min="0"
              step="1"
              placeholder="0.00"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          {props.mode === "edit" && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="sm:mr-auto"
            >
              Delete
            </Button>
          )}
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button onClick={handleSave} disabled={!isValid}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
