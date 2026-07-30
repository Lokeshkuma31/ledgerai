import { Card, CardContent } from "@/components/ui/card";
import AccountCard from "@/components/AccountCard";
import type { BankAccount } from "@/lib/banks/types";
import type { Transaction } from "@/types/transaction";

export default function ConnectedAccounts({
  accounts,
  transactionsByAccount,
}: {
  accounts: BankAccount[];
  transactionsByAccount: Map<string, Transaction[]>;
}) {
  if (accounts.length === 0) {
    return (
      <Card size="sm">
        <CardContent>
          <p className="text-muted-foreground text-sm">No accounts discovered yet — connect to run Account Discovery.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Connected Accounts</span>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} recentTransactions={transactionsByAccount.get(account.id) ?? []} />
        ))}
      </div>
    </div>
  );
}
