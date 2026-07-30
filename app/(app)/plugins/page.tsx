import PluginSettings from "@/components/PluginSettings";

export default function PluginsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Every transaction source — and every future integration — runs
        through this same plugin framework instead of modifying the core
        platform directly.
      </p>
      <PluginSettings />
    </div>
  );
}
