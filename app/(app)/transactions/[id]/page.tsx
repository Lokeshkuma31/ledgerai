import Link from "next/link";
import TransactionDetail from "@/components/TransactionDetail";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/transactions" className="text-muted-foreground w-fit text-sm hover:underline">
        ← Back to Transactions
      </Link>
      <TransactionDetail transactionId={id} />
    </div>
  );
}
