"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import MemoryTable from "@/components/MemoryTable";
import {
  clearMemory,
  forgetCategory,
  getMemoryEntries,
  type MemoryEntry,
} from "@/lib/ai/memory";

export default function MemoryManager() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);

  useEffect(() => {
    setEntries(getMemoryEntries());
  }, []);

  function handleDelete(key: string) {
    forgetCategory(key);
    setEntries(getMemoryEntries());
  }

  function handleClearAll() {
    clearMemory();
    setEntries(getMemoryEntries());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {entries.length} remembered{" "}
          {entries.length === 1 ? "mapping" : "mappings"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearAll}
          disabled={entries.length === 0}
        >
          Clear All Memory
        </Button>
      </div>
      <MemoryTable entries={entries} onDelete={handleDelete} />
    </div>
  );
}
