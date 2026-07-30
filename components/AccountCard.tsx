import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { BankAccount } from "@/lib/banks/types";
import type { Transaction } from "@/types/transaction";

const CURRENCY_SYMBOLS: Record<string, string> = { INR: "₹", USD: "$" };

function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const sign = amount < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(amount).toLocaleString("en-IN")}`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_VARIANT: Record<BankAccount["status"], "success" | "secondary" | "destructive"> = {
  active: "success",
  inactive: "secondary",
  closed: "secondary",
  error: "destructive",
};

export default function AccountCard({
  account,
  recentTransactions,
}: {
  account: BankAccount;
  recentTransactions: Transaction[];
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{account.accountName}</span>
            <span className="text-muted-foreground text-xs capitalize">
              {account.institution} · {account.accountType.replace("-", " ")} · {account.maskedNumber}
            </span>
          </div>
          <Badge variant={STATUS_VARIANT[account.status]} className="capitalize">
            {account.status}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Current Balance</span>
            <span className="text-sm font-semibold">{formatAmount(account.balance, account.currency)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Available</span>
            <span className="text-sm font-semibold">{formatAmount(account.availableBalance, account.currency)}</span>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">Last synced {formatTimestamp(account.lastSynced)}</p>
        {recentTransactions.length > 0 && (
          <div className="flex flex-col gap-1 border-t pt-2">
            <span className="text-muted-foreground text-xs font-medium">Recent Transactions</span>
            {recentTransactions.slice(0, 5).map((t) => (
              <div key={t.id} className="flex justify-between gap-2 text-xs">
                <span className="truncate">{t.note}</span>
                <span className="shrink-0">{formatAmount(t.amount, account.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
