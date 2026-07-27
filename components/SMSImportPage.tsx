"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SMSHealthCard from "@/components/SMSHealthCard";
import SMSParserStatistics from "@/components/SMSParserStatistics";
import SMSPluginSettings from "@/components/SMSPluginSettings";
import SMSPreviewTable from "@/components/SMSPreviewTable";
import { getAllPluginRecords, loadPlugins } from "@/lib/plugins/engine";
import { MOCK_SMS_MESSAGES } from "@/plugins/android-sms/mock-data";
import {
  getImportSummary,
  getSettings,
  getStatistics,
  importSelected,
  scanMessages,
  updateSettings,
} from "@/plugins/android-sms/plugin";
import type {
  AndroidSmsPluginSettings,
  ImportSummary,
  ParserStatistics,
  SmsImportPreviewRow,
} from "@/plugins/android-sms/types";
import type { PluginHealth } from "@/types/plugin";

const EMPTY_HEALTH: PluginHealth = { status: "unavailable", message: "Loading…", checkedAt: new Date().toISOString() };

export default function SMSImportPage() {
  const [rows, setRows] = useState<SmsImportPreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<AndroidSmsPluginSettings>(getSettings());
  const [stats, setStats] = useState<ParserStatistics>(getStatistics());
  const [summary, setSummary] = useState<ImportSummary>(getImportSummary());
  const [enabled, setEnabled] = useState(true);
  const [health, setHealth] = useState<PluginHealth>(EMPTY_HEALTH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refreshPluginRecord() {
    const record = getAllPluginRecords().find((r) => r.id === "android-sms");
    if (record) {
      setEnabled(record.enabled);
      setHealth(record.health);
    }
  }

  useEffect(() => {
    loadPlugins().finally(refreshPluginRecord);
  }, []);

  function handleScan() {
    setError(null);
    const scanned = scanMessages(MOCK_SMS_MESSAGES);
    setRows(scanned);
    setSelected(
      new Set(
        scanned
          .filter((r) => r.status === "Ready" && r.normalized && r.normalized.confidence >= settings.confidenceThreshold)
          .map((r) => r.message.id),
      ),
    );
    setStats(getStatistics());
    refreshPluginRecord();
  }

  function handleToggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    setSelected(new Set(rows.filter((r) => r.status === "Ready").map((r) => r.message.id)));
  }

  function handleClear() {
    setSelected(new Set());
  }

  async function handleImport() {
    setBusy(true);
    setError(null);
    try {
      const toImport = rows.filter((r) => r.status === "Ready" && selected.has(r.message.id));
      const importedIds = new Set(toImport.map((r) => r.message.id));
      const result = await importSelected(toImport);
      setRows((prev) => prev.map((r) => (importedIds.has(r.message.id) ? { ...r, status: "Imported" } : r)));
      setSelected(new Set());
      setSummary(result);
      setStats(getStatistics());
      refreshPluginRecord();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleSettingsChange(patch: Partial<AndroidSmsPluginSettings>) {
    setSettings(updateSettings(patch));
  }

  const readyCount = rows.filter((r) => r.status === "Ready").length;
  const selectedReadyCount = rows.filter((r) => r.status === "Ready" && selected.has(r.message.id)).length;

  return (
    <div className="flex flex-col gap-6">
      <SMSHealthCard
        health={health}
        enabled={enabled}
        mockMessageCount={MOCK_SMS_MESSAGES.length}
        importedCount={summary.importedCount}
        duplicateCount={summary.duplicateCount}
        averageConfidence={stats.averageConfidence}
        lastImportAt={summary.lastImportAt}
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Parser Statistics</h2>
        <SMSParserStatistics stats={stats} />
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">Plugin Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <SMSPluginSettings settings={settings} onChange={handleSettingsChange} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Import Preview</h2>
          <Button size="sm" onClick={handleScan} disabled={!enabled}>
            Scan Mock Messages
          </Button>
        </div>

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {rows.length} messages · {readyCount} ready · {selectedReadyCount} selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="xs" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="xs" onClick={handleClear}>
                  Clear
                </Button>
              </div>
            </div>

            <SMSPreviewTable rows={rows} selectedIds={selected} onToggleRow={handleToggleRow} />

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="flex justify-end">
              <Button onClick={handleImport} disabled={busy || selectedReadyCount === 0}>
                {busy ? "Importing…" : `Import ${selectedReadyCount} Selected`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
