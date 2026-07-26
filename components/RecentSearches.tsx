import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RecentSearch } from "@/types/index";

export default function RecentSearches({
  searches,
  onSelect,
  onDelete,
  onTogglePin,
  onClear,
}: {
  searches: RecentSearch[];
  onSelect: (search: RecentSearch) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onClear: () => void;
}) {
  if (searches.length === 0) {
    return (
      <Card size="sm">
        <CardContent>
          <p className="text-muted-foreground text-sm">No recent searches yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent Searches</h3>
        <Button variant="ghost" size="xs" onClick={onClear}>
          Clear All
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        {searches.map((search) => (
          <div
            key={search.id}
            className="border-border flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5"
          >
            <button
              type="button"
              onClick={() => onSelect(search)}
              className="flex-1 truncate text-left text-sm hover:underline"
            >
              {search.query || "(filters only)"}
            </button>
            <span className="text-muted-foreground text-xs">{search.resultCount} results</span>
            <Button variant="ghost" size="icon-xs" onClick={() => onTogglePin(search.id)}>
              {search.pinned ? "★" : "☆"}
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => onDelete(search.id)}>
              ✕
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
