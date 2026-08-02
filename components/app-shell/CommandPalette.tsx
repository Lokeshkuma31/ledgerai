"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { SunMoon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { resolveIndexObjectHref, search, useFinancialSearchIndex } from "@/lib/index/useFinancialSearch";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav";
import { addRecentSearch } from "@/lib/index/registry";
import type { IndexObjectType } from "@/types/index";

const RESULT_TYPE_LABELS: Partial<Record<IndexObjectType, string>> = {
  transaction: "Transaction",
  merchant: "Merchant",
  "merchant-profile": "Merchant",
  budget: "Budget",
  "recurring-transaction": "Recurring",
  recommendation: "Recommendation",
  "forecast-summary": "Forecast",
  settings: "Settings",
  document: "Document",
  email: "Email",
  connection: "Connection",
};

const RESULTS_LIMIT = 8;

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { index } = useFinancialSearchIndex();
  const [query, setQuery] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Reset the query each time the palette closes, so reopening it never
  // shows a stale search from the previous session.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const trimmedQuery = query.trim();

  const matchingPagesByGroup = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    const matches = NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(q));
    return NAV_GROUPS.map((group) => ({
      group,
      items: matches.filter((item) => item.group === group),
    })).filter((section) => section.items.length > 0);
  }, [trimmedQuery]);

  const results = useMemo(() => {
    if (!index || trimmedQuery.length === 0) return [];
    return search(index, { query: trimmedQuery, limit: RESULTS_LIMIT }).items;
  }, [index, trimmedQuery]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  function selectResult(href: string) {
    if (trimmedQuery) addRecentSearch(trimmedQuery, undefined, results.length);
    go(href);
  }

  function seeAllResults() {
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Jump to a page, search your data, or run a command"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Jump to a page, search transactions, merchants…"
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {matchingPagesByGroup.map(({ group, items }) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => (
                <CommandItem key={item.id} value={item.label} onSelect={() => go(item.href)}>
                  <item.icon />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          {results.length > 0 && (
            <CommandGroup heading="Results">
              {results.map(({ object }) => (
                <CommandItem
                  key={`${object.type}:${object.id}`}
                  value={`${object.type}:${object.id}`}
                  onSelect={() => selectResult(resolveIndexObjectHref(object))}
                >
                  <span className="text-muted-foreground text-xs">
                    {RESULT_TYPE_LABELS[object.type] ?? object.type}
                  </span>
                  <span className="truncate">{object.title}</span>
                </CommandItem>
              ))}
              <CommandItem value={`see-all:${trimmedQuery}`} onSelect={seeAllResults}>
                <span>See all results for &ldquo;{trimmedQuery}&rdquo;</span>
              </CommandItem>
            </CommandGroup>
          )}

          {trimmedQuery.length === 0 && (
            <CommandGroup heading="Commands">
              <CommandItem
                value="toggle theme"
                onSelect={() => {
                  onOpenChange(false);
                  setTheme(theme === "dark" ? "light" : "dark");
                }}
              >
                <SunMoon />
                <span>Toggle theme</span>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
