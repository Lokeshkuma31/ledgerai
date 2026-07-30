import Link from "next/link";
import SMSImportPage from "@/components/SMSImportPage";

export default function AndroidSmsPluginPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/plugins"
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← Back to Plugins
      </Link>
      <p className="text-muted-foreground max-w-2xl text-sm">
        Parses mock SMS and payment-notification data into transactions
        through the existing Ingestion Pipeline — no Android permissions or
        native APIs are used yet (see the plugin&apos;s README for the
        future milestone).
      </p>
      <SMSImportPage />
    </div>
  );
}
