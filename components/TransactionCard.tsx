import { Card, CardContent } from "@/components/ui/card";
import ReviewTransactionDialog from "@/components/ReviewTransactionDialog";
import type { Category, Transaction } from "@/types/transaction";

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatClassification(transaction: Transaction): string {
  if (transaction.userCategory !== undefined) {
    return transaction.userCategory;
  }
  if (
    transaction.aiCategory === undefined ||
    transaction.confidence === undefined
  ) {
    return "Pending AI Classification";
  }
  return `${transaction.aiCategory} (${Math.round(transaction.confidence * 100)}%)`;
}

export default function TransactionCard({
  transaction,
  onReview,
}: {
  transaction: Transaction;
  onReview: (id: string, userCategory?: Category) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-lg font-semibold">
          ₹{transaction.amount.toLocaleString("en-IN")}
        </span>
        <p className="text-sm">{transaction.note}</p>
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>{transaction.paymentMethod}</span>
          <span>{formatDate(transaction.date)}</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-muted-foreground text-xs">Category</span>
          <span className="flex items-center gap-1.5">
            {transaction.classificationSource && (
              <span
                className={
                  transaction.classificationSource === "memory"
                    ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
                }
              >
                {transaction.classificationSource === "memory"
                  ? "Learned"
                  : "AI"}
              </span>
            )}
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
              {formatClassification(transaction)}
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
            {transaction.reviewed ? "Reviewed" : "Needs Review"}
          </span>
          <ReviewTransactionDialog
            transaction={transaction}
            onReview={onReview}
          />
        </div>
      </CardContent>
    </Card>
  );
}
