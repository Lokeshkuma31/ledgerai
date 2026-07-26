"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import MerchantKnowledgeBadge from "@/components/MerchantKnowledgeBadge";
import { getMerchantProfile } from "@/lib/merchant/knowledge";
import { getTransactions } from "@/lib/storage";
import type { MerchantProfile as MerchantProfileType } from "@/types/merchant-profile";
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
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const found = getMerchantProfile(merchantId) ?? null;
    setProfile(found);
    if (found) {
      setRecentTransactions(
        getTransactions()
          .filter((t) => t.merchantId === merchantId)
          .slice(0, 10),
      );
    }
  }, [merchantId]);

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
        <h1 className="text-3xl font-semibold tracking-tight">
          {profile.canonicalName}
        </h1>
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
              <Card key={t.id} size="sm">
                <CardContent className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm">{t.note}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(t.date)}
                    </span>
                  </div>
                  <span className="text-sm font-semibold">{formatAmount(t.amount)}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
