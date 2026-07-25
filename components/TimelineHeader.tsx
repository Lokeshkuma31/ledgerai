function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function TimelineHeader({
  label,
  totalAmount,
  transactionCount,
}: {
  label: string;
  totalAmount: number;
  transactionCount: number;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="text-base font-semibold tracking-tight">{label}</h3>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm font-semibold">
          {formatCurrency(totalAmount)}
        </span>
        <span className="text-muted-foreground text-xs">
          {transactionCount}{" "}
          {transactionCount === 1 ? "Transaction" : "Transactions"}
        </span>
      </div>
    </div>
  );
}
