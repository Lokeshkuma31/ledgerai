import SearchOverview from "@/components/SearchOverview";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Search across transactions, merchants, budgets, events,
        recommendations, recurring items, forecasts, and past questions —
        all from one deterministic index.
      </p>
      <SearchOverview initialQuery={q ?? ""} />
    </div>
  );
}
