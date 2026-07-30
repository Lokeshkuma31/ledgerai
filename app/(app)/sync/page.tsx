import SyncDashboard from "@/components/SyncDashboard";

export default function SyncPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        The single engine every connected provider — email, banks, SMS,
        documents, and future plugins — synchronizes through: scheduling,
        queueing, retries, conflict handling, and history, all in one place.
      </p>
      <SyncDashboard />
    </div>
  );
}
