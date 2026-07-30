"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ImportStatusBadge from "@/components/ImportStatusBadge";
import ExtractionSummary from "@/components/ExtractionSummary";
import OCRConfidenceBadge from "@/components/OCRConfidenceBadge";
import type { DocumentRecord, ExtractedFields } from "@/plugins/document-intelligence/types";

const TYPE_LABELS: Record<string, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  "bank-statement": "Bank Statement",
  "credit-card-statement": "Credit Card Statement",
  "utility-bill": "Utility Bill",
  "salary-slip": "Salary Slip",
  "insurance-receipt": "Insurance Receipt",
  "investment-statement": "Investment Statement",
  "loan-statement": "Loan Statement",
  unknown: "Unknown Document",
};

interface EditForm {
  merchant: string;
  total: string;
  currency: string;
  invoiceNumber: string;
  receiptNumber: string;
  accountNumber: string;
  paymentMethod: string;
  issueDate: string;
  dueDate: string;
}

function toEditForm(fields: ExtractedFields): EditForm {
  return {
    merchant: fields.merchant ?? "",
    total: fields.total !== undefined ? String(fields.total) : "",
    currency: fields.currency ?? "",
    invoiceNumber: fields.invoiceNumber ?? "",
    receiptNumber: fields.receiptNumber ?? "",
    accountNumber: fields.accountNumber ?? "",
    paymentMethod: fields.paymentMethod ?? "",
    issueDate: fields.issueDate ?? "",
    dueDate: fields.dueDate ?? "",
  };
}

function toPatch(form: EditForm): Partial<ExtractedFields> {
  const patch: Partial<ExtractedFields> = {};
  if (form.merchant) patch.merchant = form.merchant;
  if (form.total) patch.total = Number(form.total);
  if (form.currency) patch.currency = form.currency;
  if (form.invoiceNumber) patch.invoiceNumber = form.invoiceNumber;
  if (form.receiptNumber) patch.receiptNumber = form.receiptNumber;
  if (form.accountNumber) patch.accountNumber = form.accountNumber;
  if (form.paymentMethod) patch.paymentMethod = form.paymentMethod;
  if (form.issueDate) patch.issueDate = form.issueDate;
  if (form.dueDate) patch.dueDate = form.dueDate;
  return patch;
}

export default function DocumentPreview({
  record,
  busy,
  onImport,
  onSkip,
  onReject,
  onSaveEdits,
}: {
  record: DocumentRecord;
  busy?: boolean;
  onImport: (force?: boolean) => void;
  onSkip: () => void;
  onReject: () => void;
  onSaveEdits: (patch: Partial<ExtractedFields>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => toEditForm(record.fields));

  const decided = record.status === "imported" || record.status === "skipped" || record.status === "rejected";

  function startEditing() {
    setForm(toEditForm(record.fields));
    setEditing(true);
  }

  function saveEdits() {
    onSaveEdits(toPatch(form));
    setEditing(false);
  }

  return (
    <Card size="sm" className="hover:ring-primary/30 transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col">
          <CardTitle className="text-base">{record.fileName}</CardTitle>
          <span className="text-muted-foreground text-xs">{TYPE_LABELS[record.documentType]}</span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <OCRConfidenceBadge confidence={record.classificationConfidence} label="Classification" />
          <OCRConfidenceBadge confidence={record.extractionConfidence} label="Extraction" />
          <ImportStatusBadge status={record.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {record.matchedRules.length > 0 && (
          <p className="text-muted-foreground text-xs">Matched rules: {record.matchedRules.join(", ")}</p>
        )}

        {record.validationErrors.length > 0 && (
          <div className="border-warning/30 bg-warning/10 text-warning flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs">
            {record.validationErrors.map((error, index) => (
              <span key={index}>{error.message}</span>
            ))}
          </div>
        )}

        {record.isDuplicate && (
          <p className="text-destructive text-xs">
            Flagged as a duplicate{record.duplicateOfId ? ` of a document already on file.` : "."}
          </p>
        )}

        {editing ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ["merchant", "Merchant"],
                ["total", "Total"],
                ["currency", "Currency"],
                ["invoiceNumber", "Invoice Number"],
                ["receiptNumber", "Receipt Number"],
                ["accountNumber", "Account Number"],
                ["paymentMethod", "Payment Method"],
                ["issueDate", "Issue Date"],
                ["dueDate", "Due Date"],
              ] as [keyof EditForm, string][]
            ).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <Label htmlFor={`${record.id}-${key}`} className="text-xs">
                  {label}
                </Label>
                <Input
                  id={`${record.id}-${key}`}
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        ) : (
          <ExtractionSummary fields={record.fields} />
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {editing ? (
            <>
              <Button size="xs" onClick={saveEdits} disabled={busy}>
                Save Fields
              </Button>
              <Button size="xs" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {!decided && (
                <>
                  <Button size="xs" onClick={() => onImport(record.isDuplicate)} disabled={busy}>
                    {record.isDuplicate ? "Import Anyway" : "Import"}
                  </Button>
                  <Button size="xs" variant="outline" onClick={startEditing} disabled={busy}>
                    Edit Fields
                  </Button>
                  <Button size="xs" variant="outline" onClick={onSkip} disabled={busy}>
                    Skip
                  </Button>
                  <Button size="xs" variant="destructive" onClick={onReject} disabled={busy}>
                    Reject
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
