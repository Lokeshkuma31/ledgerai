"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SearchBar({
  initialQuery = "",
  onSearch,
}: {
  initialQuery?: string;
  onSearch: (query: string) => void;
}) {
  const [value, setValue] = useState(initialQuery);

  function handleSubmit() {
    onSearch(value.trim());
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Search transactions, merchants, budgets, recommendations…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
      />
      <Button onClick={handleSubmit}>Search</Button>
    </div>
  );
}
