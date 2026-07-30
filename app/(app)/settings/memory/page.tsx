import MemoryManager from "@/components/MemoryManager";

export default function MemorySettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        LedgerAI remembers categories you&apos;ve taught it. Matching notes
        skip the classifier next time.
      </p>
      <MemoryManager />
    </div>
  );
}
