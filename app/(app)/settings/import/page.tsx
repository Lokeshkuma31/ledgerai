import ImportHistoryList from "@/components/ImportHistoryList";

export default function ImportSettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Every CSV import you&apos;ve run, with counts and any skipped rows.
      </p>
      <ImportHistoryList />
    </div>
  );
}
