"use client";

import Link from "next/link";
import { Link2, PiggyBank, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddExpenseDialog from "@/components/AddExpenseDialog";
import ImportDialog from "@/components/ImportDialog";

/** CommandPalette owns its own open state and listens for this exact key
 * combination on window — dispatching it here is the least invasive way to
 * open Cmd+K from a plain button, without threading palette state through
 * a new context just for this one row. */
function openCommandPalette() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
}

/**
 * A dedicated, user-initiated action surface — distinct from Needs
 * Attention's system-surfaced CTAs. Reuses the existing ImportDialog/
 * AddExpenseDialog rather than rebuilding their flows just for a new look.
 */
export default function QuickActions({ onDataChanged }: { onDataChanged: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ImportDialog onImported={onDataChanged} />
      <Button variant="outline" nativeButton={false} render={<Link href="/connections" />}>
        <Link2 />
        Connect
      </Button>
      <Button variant="outline" nativeButton={false} render={<Link href="/ai-coach" />}>
        <Sparkles />
        Ask AI
      </Button>
      <Button variant="outline" onClick={openCommandPalette}>
        <Search />
        Search
      </Button>
      <Button variant="outline" nativeButton={false} render={<Link href="/budgets" />}>
        <PiggyBank />
        Create Budget
      </Button>
      <AddExpenseDialog onAdd={onDataChanged} />
    </div>
  );
}
