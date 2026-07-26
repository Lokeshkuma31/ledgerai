"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getMerchantKnowledgeStatistics } from "@/lib/merchant/knowledge-statistics";
import type { MerchantKnowledgeStatistics } from "@/types/merchant-profile";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="hover:underline">
      {content}
    </Link>
  ) : (
    content
  );
}

export default function MerchantStatistics() {
  const [stats, setStats] = useState<MerchantKnowledgeStatistics | null>(null);

  useEffect(() => {
    setStats(getMerchantKnowledgeStatistics());
  }, []);

  if (!stats || stats.topMerchantsBySpend.length === 0) return null;

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.mostExpensiveMerchant && (
          <Stat
            label="Most Expensive"
            value={`${stats.mostExpensiveMerchant.canonicalName} (${formatAmount(stats.mostExpensiveMerchant.totalSpend)})`}
            href={`/merchants/${stats.mostExpensiveMerchant.id}`}
          />
        )}
        {stats.mostFrequentMerchant && (
          <Stat
            label="Most Frequent"
            value={`${stats.mostFrequentMerchant.canonicalName} (${stats.mostFrequentMerchant.transactionCount}x)`}
            href={`/merchants/${stats.mostFrequentMerchant.id}`}
          />
        )}
        {stats.fastestGrowingMerchant && (
          <Stat
            label="Fastest Growing"
            value={`${stats.fastestGrowingMerchant.canonicalName} (${stats.fastestGrowingMerchant.transactionsPerDay}/day)`}
            href={`/merchants/${stats.fastestGrowingMerchant.id}`}
          />
        )}
        {stats.newestMerchant && (
          <Stat
            label="Newest Merchant"
            value={stats.newestMerchant.canonicalName}
            href={`/merchants/${stats.newestMerchant.id}`}
          />
        )}
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
          <span className="text-muted-foreground text-xs">Top Merchants</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {stats.topMerchantsBySpend.map((m) => (
              <Link
                key={m.id}
                href={`/merchants/${m.id}`}
                className="hover:underline"
              >
                {m.canonicalName}{" "}
                <span className="text-muted-foreground">
                  {formatAmount(m.totalSpend)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
