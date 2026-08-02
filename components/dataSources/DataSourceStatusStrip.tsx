"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StatusDot from "@/components/shared/StatusDot";
import { getAllConnectorRecords } from "@/lib/banks/registry";
import type { ConnectionRecord } from "@/lib/connections/types";
import { getAllEmailProviderRecords } from "@/lib/email/registry";
import { getQueueSnapshot } from "@/lib/sync/engine";
import { computeSyncEngineHealth } from "@/lib/sync/health";
import { getAllDocuments } from "@/plugins/document-intelligence/registry";

type Tone = "success" | "warning" | "destructive" | "muted";

function worstTone(tones: Tone[]): Tone {
  if (tones.includes("destructive")) return "destructive";
  if (tones.includes("warning")) return "warning";
  if (tones.includes("success")) return "success";
  return "muted";
}

/**
 * A shared health-at-a-glance strip for the five Data Sources pages
 * (Connections, Banks, Emails, Documents, Sync) — landing on any one of
 * them now shows the health of all five, not just the one clicked into.
 * Deliberately presentational only: it reads each area's own already-
 * computed health/records, it doesn't unify their underlying data models
 * (Connections is real OAuth via node:fs; Banks/Emails/Documents/Sync are
 * client-side localStorage — see the design spec's explicit scope note on
 * why that unification is out of scope here).
 */
export default function DataSourceStatusStrip({ connections }: { connections: ConnectionRecord[] }) {
  const [banksTone, setBanksTone] = useState<Tone>("muted");
  const [emailTone, setEmailTone] = useState<Tone>("muted");
  const [documentsTone, setDocumentsTone] = useState<Tone>("muted");
  const [documentsLabel, setDocumentsLabel] = useState("No documents yet");
  const [syncTone, setSyncTone] = useState<Tone>("muted");
  const [syncLabel, setSyncLabel] = useState("No syncs yet");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const connectors = getAllConnectorRecords();
    setBanksTone(
      connectors.length === 0
        ? "muted"
        : worstTone(
            connectors.map((c): Tone => {
              if (c.health.status === "error") return "destructive";
              if (c.health.status === "warning" || c.health.status === "authentication-required") return "warning";
              if (c.health.status === "disconnected") return "muted";
              return "success";
            }),
          ),
    );

    const providers = getAllEmailProviderRecords();
    setEmailTone(
      providers.length === 0
        ? "muted"
        : worstTone(
            providers.map((p): Tone => {
              if (p.health.status === "error") return "destructive";
              if (p.health.status === "warning") return "warning";
              return "success";
            }),
          ),
    );

    const documents = getAllDocuments();
    const failedCount = documents.filter((d) => d.status === "failed").length;
    const pendingCount = documents.filter((d) => d.status === "processed").length;
    setDocumentsTone(
      failedCount > 0 ? "destructive" : pendingCount > 0 ? "warning" : documents.length > 0 ? "success" : "muted",
    );
    setDocumentsLabel(
      failedCount > 0
        ? `${failedCount} failed`
        : pendingCount > 0
          ? `${pendingCount} pending review`
          : documents.length > 0
            ? "All caught up"
            : "No documents yet",
    );

    computeSyncEngineHealth(getQueueSnapshot()).then((health) => {
      setSyncing(health.runningJobs > 0);
      setSyncTone(health.failedJobs > 0 ? "destructive" : "success");
      setSyncLabel(
        health.runningJobs > 0
          ? `${health.runningJobs} syncing`
          : health.failedJobs > 0
            ? `${health.failedJobs} failed`
            : health.lastSuccessfulSyncAt
              ? "Up to date"
              : "No syncs yet",
      );
    });
  }, []);

  const activeConnections = connections.filter((c) => c.status !== "disconnected");
  const connectionsTone = worstTone(
    activeConnections.map((c): Tone => {
      if (c.health.status === "authentication-failed" || c.health.status === "permission-revoked") return "destructive";
      if (c.health.status === "warning" || c.health.status === "expired-token") return "warning";
      return "success";
    }),
  );

  return (
    <div className="border-border bg-surface-2/50 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-3">
      <Link href="/connections" className="hover:opacity-80">
        <StatusDot
          tone={connectionsTone}
          live={connectionsTone === "success"}
          label={`Connections · ${activeConnections.length} active`}
        />
      </Link>
      <Link href="/banks" className="hover:opacity-80">
        <StatusDot tone={banksTone} label="Banks" />
      </Link>
      <Link href="/email" className="hover:opacity-80">
        <StatusDot tone={emailTone} label="Emails" />
      </Link>
      <Link href="/documents" className="hover:opacity-80">
        <StatusDot tone={documentsTone} label={`Documents · ${documentsLabel}`} />
      </Link>
      <Link href="/sync" className="hover:opacity-80">
        <StatusDot tone={syncTone} live={syncing} label={`Sync · ${syncLabel}`} />
      </Link>
    </div>
  );
}
