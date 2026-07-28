import Link from "next/link";
import EmailDashboard from "@/components/EmailDashboard";

export default function EmailPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-muted-foreground w-fit text-sm hover:underline">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Email</h1>
        <p className="text-muted-foreground text-sm">
          Financial email classification, extraction, and attachment handling — mock provider data only, so a real
          Gmail API, Microsoft Graph, IMAP, or Exchange provider can replace it later without changing anything else
          here.
        </p>
      </div>
      <EmailDashboard />
    </main>
  );
}
