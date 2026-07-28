"use client";

import { useEffect, useState } from "react";
import DocumentUpload from "@/components/DocumentUpload";
import DocumentPreview from "@/components/DocumentPreview";
import DocumentStatistics from "@/components/DocumentStatistics";
import DocumentHistory from "@/components/DocumentHistory";
import { Button } from "@/components/ui/button";
import { computeStatistics, getAllDocuments } from "@/plugins/document-intelligence/registry";
import { editDocumentFields, importDocument, rejectDocument, skipDocument } from "@/plugins/document-intelligence/pipeline";
import type { DocumentRecord, DocumentStatistics as Stats, ExtractedFields } from "@/plugins/document-intelligence/types";

export default function DocumentIntelligenceDashboard() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setDocuments(getAllDocuments());
    setStats(computeStatistics());
  }

  // Registry state lives in localStorage, which doesn't exist during
  // server rendering — loading it here (not in useState initializers)
  // avoids a hydration mismatch, the same fix every other plugin
  // dashboard in this app needed.
  useEffect(() => {
    refresh();
  }, []);

  async function withBusy(id: string, action: () => unknown) {
    setError(null);
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refresh();
    }
  }

  const pending = documents.filter((d) => d.status === "processed" || d.status === "duplicate");

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="ghost" size="xs" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <DocumentUpload onProcessed={refresh} />

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Upload Preview</span>
          {pending.map((record) => (
            <DocumentPreview
              key={record.id}
              record={record}
              busy={busyIds.has(record.id)}
              onImport={(force) => void withBusy(record.id, () => importDocument(record.id, { force }))}
              onSkip={() => void withBusy(record.id, () => skipDocument(record.id))}
              onReject={() => void withBusy(record.id, () => rejectDocument(record.id))}
              onSaveEdits={(patch: Partial<ExtractedFields>) => void withBusy(record.id, () => editDocumentFields(record.id, patch))}
            />
          ))}
        </div>
      )}

      {stats && <DocumentStatistics stats={stats} />}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Document History</span>
        <DocumentHistory documents={documents} />
      </div>
    </div>
  );
}
