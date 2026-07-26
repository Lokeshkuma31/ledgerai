"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function QueryInput({
  onSubmit,
  pending,
}: {
  onSubmit: (question: string) => void;
  pending: boolean;
}) {
  const [value, setValue] = useState("");

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || pending) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Ask about your spending…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
        disabled={pending}
      />
      <Button onClick={handleSubmit} disabled={pending || !value.trim()}>
        {pending ? "Asking…" : "Send"}
      </Button>
    </div>
  );
}
