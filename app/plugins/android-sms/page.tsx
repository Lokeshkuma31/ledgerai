import Link from "next/link";
import SMSImportPage from "@/components/SMSImportPage";

export default function AndroidSmsPluginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link href="/plugins" className="text-muted-foreground w-fit text-sm hover:underline">
          ← Back to Plugins
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Android SMS & Notification Source</h1>
        <p className="text-muted-foreground text-sm">
          Parses mock SMS and payment-notification data into transactions through the existing Ingestion Pipeline —
          no Android permissions or native APIs are used yet (see the plugin&apos;s README for the future milestone).
        </p>
      </div>
      <SMSImportPage />
    </main>
  );
}
