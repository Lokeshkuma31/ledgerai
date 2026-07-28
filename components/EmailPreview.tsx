"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AttachmentList from "@/components/AttachmentList";
import OCRConfidenceBadge from "@/components/OCRConfidenceBadge";
import type { EmailRecord, ExtractedEmailFields } from "@/lib/email/types";

const TYPE_LABELS: Record<string, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  "subscription-renewal": "Subscription Renewal",
  refund: "Refund",
  "salary-slip": "Salary Slip",
  "utility-bill": "Utility Bill",
  "credit-card-statement": "Credit Card Statement",
  "bank-statement": "Bank Statement",
  "flight-booking": "Flight Booking",
  "hotel-booking": "Hotel Booking",
  insurance: "Insurance",
  loan: "Loan",
  "investment-report": "Investment Report",
  "tax-document": "Tax Document",
  unknown: "Unknown Email",
};

const STATUS_STYLES: Record<EmailRecord["status"], string> = {
  processed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  duplicate: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  imported: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  skipped: "bg-muted text-muted-foreground",
  rejected: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};

function formatAmount(amount: number | undefined, currency?: string): string {
  if (amount === undefined) return "—";
  const symbol = currency === "INR" ? "₹" : currency ? `${currency} ` : "";
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

interface EditForm {
  merchant: string;
  amount: string;
  currency: string;
  invoiceNumber: string;
  referenceNumber: string;
  dueDate: string;
}

function toEditForm(fields: ExtractedEmailFields): EditForm {
  return {
    merchant: fields.merchant ?? "",
    amount: fields.amount !== undefined ? String(fields.amount) : "",
    currency: fields.currency ?? "",
    invoiceNumber: fields.invoiceNumber ?? "",
    referenceNumber: fields.referenceNumber ?? "",
    dueDate: fields.dueDate ?? "",
  };
}

function toPatch(form: EditForm, fields: ExtractedEmailFields): Partial<ExtractedEmailFields> {
  const patch: Partial<ExtractedEmailFields> = {};
  if (form.merchant) patch.merchant = form.merchant;
  if (form.currency) patch.currency = form.currency;
  if (form.invoiceNumber) patch.invoiceNumber = form.invoiceNumber;
  if (form.referenceNumber) patch.referenceNumber = form.referenceNumber;
  if (form.dueDate) patch.dueDate = form.dueDate;
  if (form.amount) {
    const amount = Number(form.amount);
    patch.amount = amount;
    // Synthesizes the one line item Import needs when the parser found no
    // transaction of its own — mirrors pipeline.ts's engine-side fallback,
    // but applied here so an edited amount is immediately importable.
    if (fields.transactions.length === 0) {
      patch.transactions = [{ description: form.merchant || fields.merchant || fields.sender, amount, date: form.dueDate || fields.dueDate || fields.subject, direction: "debit" }];
    }
  }
  return patch;
}

export default function EmailPreview({
  record,
  busy,
  onImport,
  onSkip,
  onReject,
  onSaveEdits,
}: {
  record: EmailRecord;
  busy?: boolean;
  onImport: (force?: boolean) => void;
  onSkip: () => void;
  onReject: () => void;
  onSaveEdits: (patch: Partial<ExtractedEmailFields>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => toEditForm(record.fields));

  const decided = record.status === "imported" || record.status === "skipped" || record.status === "rejected";

  function startEditing() {
    setForm(toEditForm(record.fields));
    setEditing(true);
  }

  function saveEdits() {
    onSaveEdits(toPatch(form, record.fields));
    setEditing(false);
  }

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col">
          <CardTitle className="text-base">{record.subject}</CardTitle>
          <span className="text-muted-foreground text-xs">
            {record.sender} · {TYPE_LABELS[record.emailType]}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <OCRConfidenceBadge confidence={record.classificationConfidence} label="Classification" />
          <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap capitalize ${STATUS_STYLES[record.status]}`}>{record.status}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {record.matchedRules.length > 0 && <p className="text-muted-foreground text-xs">Matched rules: {record.matchedRules.join(", ")}</p>}

        {record.validationErrors.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {record.validationErrors.map((error, index) => (
              <span key={index}>{error.message}</span>
            ))}
          </div>
        )}

        {record.isDuplicate && <p className="text-destructive text-xs">Flagged as a duplicate of an email already on file.</p>}

        {editing ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ["merchant", "Merchant"],
                ["amount", "Amount"],
                ["currency", "Currency"],
                ["invoiceNumber", "Invoice Number"],
                ["referenceNumber", "Reference Number"],
                ["dueDate", "Due Date"],
              ] as [keyof EditForm, string][]
            ).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <Label htmlFor={`${record.id}-${key}`} className="text-xs">
                  {label}
                </Label>
                <Input id={`${record.id}-${key}`} value={form[key]} onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Merchant</span>
                <span className="font-medium">{record.fields.merchant ?? "—"}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{formatAmount(record.fields.amount, record.fields.currency)}</span>
              </div>
              {record.fields.invoiceNumber && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">Invoice Number</span>
                  <span className="font-medium">{record.fields.invoiceNumber}</span>
                </div>
              )}
              {record.fields.referenceNumber && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">Reference Number</span>
                  <span className="font-medium">{record.fields.referenceNumber}</span>
                </div>
              )}
              {record.fields.dueDate && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">Due Date</span>
                  <span className="font-medium">{record.fields.dueDate}</span>
                </div>
              )}
              {record.fields.statementPeriod && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">Statement Period</span>
                  <span className="font-medium">
                    {record.fields.statementPeriod.start} to {record.fields.statementPeriod.end}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-medium">Transactions Found ({record.fields.transactions.length})</span>
              {record.fields.transactions.length > 0 ? (
                record.fields.transactions.map((line, index) => (
                  <div key={index} className="flex justify-between gap-2 text-xs">
                    <span className="truncate">{line.description}</span>
                    <span className="shrink-0">
                      {line.date} · {formatAmount(line.amount, record.fields.currency)} ({line.direction})
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-xs">No transaction lines were extracted from the body.</p>
              )}
            </div>

            <AttachmentList attachments={record.fields.attachments} />
          </>
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
            !decided && (
              <>
                <Button size="xs" onClick={() => onImport(record.isDuplicate)} disabled={busy}>
                  {record.isDuplicate ? "Import Anyway" : "Import"}
                </Button>
                <Button size="xs" variant="outline" onClick={startEditing} disabled={busy}>
                  Edit
                </Button>
                <Button size="xs" variant="outline" onClick={onSkip} disabled={busy}>
                  Skip
                </Button>
                <Button size="xs" variant="destructive" onClick={onReject} disabled={busy}>
                  Reject
                </Button>
              </>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
