import SourceSettings from "@/components/SourceSettings";

export default function SourcesSettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Every transaction in LedgerAI comes from a source plugin. Manage
        which sources are active below.
      </p>
      <SourceSettings />
    </div>
  );
}
