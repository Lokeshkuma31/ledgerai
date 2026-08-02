"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CategoryIcon from "@/components/shared/CategoryIcon";
import MerchantAvatar from "@/components/shared/MerchantAvatar";
import MerchantKnowledgeBadge from "@/components/MerchantKnowledgeBadge";
import MerchantRecurringList from "@/components/MerchantRecurringList";
import MerchantSpendChart from "@/components/MerchantSpendChart";
import WhyButton from "@/components/WhyButton";
import { explainMerchantProfile } from "@/lib/explanations/engine";
import { generateForecast } from "@/lib/forecast/engine";
import { generateInsights } from "@/lib/insights/engine";
import { getAllMerchantProfiles, getMerchantProfile } from "@/lib/merchant/knowledge";
import { detectRecurringTransactions } from "@/lib/recurring/engine";
import { getTransactions } from "@/lib/storage";
import { generateMonthlyCashFlow } from "@/lib/timeline/monthly";
import { generateTimeline } from "@/lib/timeline/engine";
import type { ExplanationContext } from "@/types/explanation";
import type { MerchantProfile as MerchantProfileType } from "@/types/merchant-profile";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

export default function MerchantProfile({ merchantId }: { merchantId: string }) {
  const [profile, setProfile] = useState<MerchantProfileType | null | undefined>(undefined);
  const [merchantTransactions, setMerchantTransactions] = useState<Transaction[]>([]);
  const [merchantRecurring, setMerchantRecurring] = useState<RecurringTransaction[]>([]);
  const [explanationContext, setExplanationContext] = useState<ExplanationContext | null>(null);

  useEffect(() => {
    const found = getMerchantProfile(merchantId) ?? null;
    setProfile(found);
    if (found) {
      const transactions = getTransactions();
      setMerchantTransactions(transactions.filter((t) => t.merchantId === merchantId));

      const now = new Date();
      const insights = generateInsights(transactions);
      const timeline = generateTimeline(transactions, now);
      const merchantProfiles = getAllMerchantProfiles();
      const recurring = detectRecurringTransactions(transactions, merchantProfiles, now).items;
      setMerchantRecurring(recurring.filter((r) => r.merchantId === merchantId));
      setExplanationContext({
        transactions,
        budgets: [],
        events: [],
        recommendations: [],
        recurring: [],
        merchantProfiles,
        forecast: generateForecast(transactions, [], [], insights, timeline, now),
        insights,
        timeline,
        now,
      });
    }
  }, [merchantId]);

  const recentTransactions = useMemo(() => merchantTransactions.slice(0, 10), [merchantTransactions]);
  const spendChartData = useMemo(
    () => generateMonthlyCashFlow(merchantTransactions, 6),
    [merchantTransactions],
  );

  if (profile === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (profile === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Merchant not found.{" "}
        <Link href="/merchants" className="hover:underline">
          Back to Merchants
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <MerchantAvatar name={profile.canonicalName} size="lg" />
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {profile.canonicalName}
            </h1>
            {explanationContext && (
              <WhyButton explain={() => explainMerchantProfile(profile, explanationContext)} />
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <MerchantKnowledgeBadge label={profile.industry} />
          <MerchantKnowledgeBadge label={profile.merchantType} tone="muted" />
          <MerchantKnowledgeBadge label={profile.defaultCategory} tone="muted" />
          {profile.isRecurringFriendly && (
            <MerchantKnowledgeBadge label="Recurring" tone="muted" />
          )}
          {profile.isOnline && <MerchantKnowledgeBadge label="Online" tone="muted" />}
        </div>
        {profile.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profile.tags.map((tag) => (
              <MerchantKnowledgeBadge key={tag} label={tag} tone="muted" />
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Average Transaction" value={formatAmount(profile.averageTransactionAmount)} />
          <Stat label="Total Spend" value={formatAmount(profile.totalSpend)} />
          <Stat label="Total Transactions" value={String(profile.transactionCount)} />
          <Stat label="First Seen" value={formatDate(profile.firstSeen)} />
          <Stat label="Last Seen" value={formatDate(profile.lastSeen)} />
          <Stat label="Confidence" value={`${Math.round(profile.confidence * 100)}%`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spending Trend</CardTitle>
          <p className="text-muted-foreground text-xs">Trailing 6 months</p>
        </CardHeader>
        <CardContent>
          <MerchantSpendChart data={spendChartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recurring Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <MerchantRecurringList items={merchantRecurring} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Aliases</h2>
        {profile.aliases.length === 0 ? (
          <p className="text-muted-foreground text-sm">None recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {profile.aliases.map((alias) => (
              <MerchantKnowledgeBadge key={alias} label={alias} tone="muted" />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Recent Transactions</h2>
        {recentTransactions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No transactions yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentTransactions.map((t) => (
              <Link key={t.id} href={`/transactions/${t.id}`}>
                <Card size="sm" className="hover:ring-primary/30 transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <CategoryIcon category={t.userCategory ?? t.aiCategory} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm">{t.note}</span>
                        <span className="text-muted-foreground text-xs">
                          {formatDate(t.date)}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-semibold">{formatAmount(t.amount)}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
