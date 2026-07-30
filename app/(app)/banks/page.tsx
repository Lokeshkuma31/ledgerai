import BankDashboard from "@/components/BankDashboard";

export default function BanksPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Connected institutions, accounts, and sync history — every connector
        runs through the Bank Connector Framework&apos;s standardized
        interfaces, so a real bank integration can replace a demo connector
        later without changing anything else here.
      </p>
      <BankDashboard />
    </div>
  );
}
