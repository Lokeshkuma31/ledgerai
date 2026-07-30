import NotificationSettings from "@/components/NotificationSettings";

export default function NotificationSettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Decide which financial events deserve your attention, when, and
        through which channels. Nothing here is actually sent — these are
        recommendations for future delivery systems.
      </p>
      <NotificationSettings />
    </div>
  );
}
