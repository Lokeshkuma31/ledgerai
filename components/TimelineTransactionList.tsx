import TransactionCard from "@/components/TransactionCard";
import type { Category, Transaction } from "@/types/transaction";

export default function TimelineTransactionList({
  transactions,
  onReview,
}: {
  transactions: Transaction[];
  onReview: (id: string, userCategory?: Category) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {transactions.map((transaction) => (
        <TransactionCard
          key={transaction.id}
          transaction={transaction}
          onReview={onReview}
        />
      ))}
    </div>
  );
}
