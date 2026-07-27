"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SMSHealthCard from "@/components/SMSHealthCard";
import SMSParserStatistics from "@/components/SMSParserStatistics";
import SMSPluginSettings from "@/components/SMSPluginSettings";
import SMSPreviewTable from "@/components/SMSPreviewTable";
import { checkPluginHealth, getAllPluginRecords, loadPlugins } from "@/lib/plugins/engine";
import { MOCK_SMS_MESSAGES } from "@/plugins/android-sms/mock-data";
import {
  DEFAULT_SETTINGS,
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
const EMPTY_STATISTICS: ParserStatistics = {
  messagesParsed: 0,
  successfulParses: 0,
  failedParses: 0,
  averageConfidence: 0,
  duplicatesSkipped: 0,
  unknownMerchants: 0,
  unknownFormats: 0,
};
const EMPTY_SUMMARY: ImportSummary = {
  totalMessages: 0,
  importedCount: 0,
  duplicateCount: 0,
  skippedCount: 0,
  failedCount: 0,
  lastImportAt: null,
};

export default function SMSImportPage() {
  const [rows, setRows] = useState<SmsImportPreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // These read localStorage, which doesn't exist during server rendering —
  // starting from a fixed default (matching what the server rendered) and
  // loading the real persisted values inside the mount effect below avoids
  // a hydration mismatch between the server and client's first render.
  const [settings, setSettings] = useState<AndroidSmsPluginSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<ParserStatistics>(EMPTY_STATISTICS);
  const [summary, setSummary] = useState<ImportSummary>(EMPTY_SUMMARY);
  const [enabled, setEnabled] = useState(true);
  const [health, setHealth] = useState<PluginHealth>(EMPTY_HEALTH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Plugin Framework's health() is pull-based — it only reflects the
  // plugin's *current* statistics when something explicitly (re-)checks
  // it, otherwise the badge would keep showing whatever health was
  // computed at install time (e.g. "no messages scanned yet") even after a
  // real scan/import made it stale. Called after mount, and after every
  // scan/import, so the badge always matches what's actually on screen.
  async function refreshPluginRecord() {
    const record = getAllPluginRecords().find((r) => r.id === "android-sms");
    if (record) setEnabled(record.enabled);
    setHealth(await checkPluginHealth("android-sms"));
  }

  useEffect(() => {
    setSettings(getSettings());
    setStats(getStatistics());
    setSummary(getImportSummary());
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
    void refreshPluginRecord();
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
      // The full scanned batch is passed (not just the selected subset) so
      // the returned summary's duplicateCount/skippedCount/failedCount
      // reflect what scanning actually found; `selected` only narrows which
      // Ready rows get imported.
      const importedIds = new Set(selected);
      const result = await importSelected(rows, selected);
      setRows((prev) => prev.map((r) => (importedIds.has(r.message.id) ? { ...r, status: "Imported" } : r)));
      setSelected(new Set());
      setSummary(result);
      setStats(getStatistics());
      await refreshPluginRecord();
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
