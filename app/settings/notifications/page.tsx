import Link from "next/link";
import NotificationSettings from "@/components/NotificationSettings";

export default function NotificationSettingsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground text-sm">
          Decide which financial events deserve your attention, when, and through which channels.
          Nothing here is actually sent — these are recommendations for future delivery systems.
        </p>
      </div>
      <NotificationSettings />
    </main>
  );
}
