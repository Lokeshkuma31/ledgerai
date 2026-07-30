import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SearchStatistics as SearchStatisticsType } from "@/types/index";

export default function SearchStatistics({ stats }: { stats: SearchStatisticsType }) {
  const typeEntries = Object.entries(stats.countsByType).filter(([, count]) => count > 0);

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Indexed Objects</span>
          <span className="text-sm font-semibold">{stats.totalIndexedObjects}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {typeEntries.map(([type, count]) => (
            <Badge key={type} variant="secondary">
              {type}: {count}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Total Searches</span>
          <span className="text-sm font-semibold">{stats.totalSearches}</span>
        </div>
        {stats.mostSearchedTerms.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Most Searched</span>
            <div className="flex flex-wrap gap-1.5">
              {stats.mostSearchedTerms.map((t) => (
                <Badge key={t.term} variant="secondary">
                  {t.term} ({t.count})
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
