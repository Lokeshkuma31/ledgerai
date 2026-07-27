import Link from "next/link";
import BankDashboard from "@/components/BankDashboard";

export default function BanksPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-muted-foreground w-fit text-sm hover:underline">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Banks</h1>
        <p className="text-muted-foreground text-sm">
          Connected institutions, accounts, and sync history — every connector runs through the Bank Connector
          Framework&apos;s standardized interfaces, so a real bank integration can replace a demo connector later
          without changing anything else here.
        </p>
      </div>
      <BankDashboard />
    </main>
  );
}
