import Link from "next/link";
import TransactionList from "@/components/TransactionList";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <Link
          href="/settings/memory"
          className="text-muted-foreground text-sm hover:underline"
        >
          Memory
        </Link>
      </div>
      <TransactionList />
    </main>
  );
}
