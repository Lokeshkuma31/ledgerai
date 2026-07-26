"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import ImportErrors from "@/components/ImportErrors";
import ImportPreviewTable from "@/components/ImportPreviewTable";
import ImportSummary from "@/components/ImportSummary";
import { buildImportPreview, executeImport } from "@/lib/import/engine";
import { getTransactions } from "@/lib/storage";
import type { ImportPreview, ImportReport } from "@/types/import";

type Step = "select" | "preview" | "importing" | "done";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsText(file);
  });
}

export default function ImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("select");
    setPreview(null);
    setReport(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleFileSelected(file: File) {
    setError(null);
    try {
      const text = await readFileAsText(file);
      const built = buildImportPreview(file.name, text, getTransactions());
      setPreview(built);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setStep("importing");
    setError(null);
    try {
      const result = await executeImport(preview);
      setReport(result);
      setStep("done");
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setStep("preview");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline">Import CSV</Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Transactions</DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-muted-foreground text-sm">
              Choose a CSV file with Date, Description, and Amount columns
              (Payment Method, Debit/Credit, and Reference are optional).
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              className="text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelected(file);
              }}
            />
          </div>
        )}

        {step === "preview" && preview && (
          <div className="flex flex-col gap-3 py-2">
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>{preview.totalRows} rows found in {preview.fileName}</span>
              <span>
                {preview.readyCount} ready · {preview.duplicateCount} duplicate ·{" "}
                {preview.invalidCount} invalid
              </span>
            </div>
            <ImportPreviewTable rows={preview.rows} />
          </div>
        )}

        {step === "importing" && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Importing {preview?.readyCount ?? 0} transactions…
          </p>
        )}

        {step === "done" && report && (
          <div className="flex flex-col gap-3 py-2">
            <ImportSummary report={report} />
            <ImportErrors warnings={report.warnings} />
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          {step === "select" && (
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
          )}
          {step === "preview" && (
            <>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <Button
                onClick={handleConfirm}
                disabled={!preview || preview.readyCount === 0}
              >
                Import {preview?.readyCount ?? 0} Transactions
              </Button>
            </>
          )}
          {step === "done" && (
            <DialogClose render={<Button>Close</Button>} />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
