import TransactionsTable from "@/components/TransactionsTable";

export default function TransactionsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Every transaction across every connected source — search, filter, and
        sort, or open one to review its AI-assigned category.
      </p>
      <TransactionsTable />
    </div>
  );
}
