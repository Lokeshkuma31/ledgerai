import type { ExtractedFields } from "@/plugins/document-intelligence/types";

const CURRENCY_SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

function formatAmount(amount: number, currency?: string): string {
  const symbol = currency ? (CURRENCY_SYMBOLS[currency] ?? `${currency} `) : "";
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

export default function ExtractionSummary({ fields }: { fields: ExtractedFields }) {
  const rows: { label: string; value: string }[] = [];
  if (fields.merchant) rows.push({ label: "Merchant", value: fields.merchant });
  if (fields.amount !== undefined) rows.push({ label: "Amount", value: formatAmount(fields.amount, fields.currency) });
  if (fields.tax !== undefined) rows.push({ label: "Tax", value: formatAmount(fields.tax, fields.currency) });
  if (fields.discount !== undefined) rows.push({ label: "Discount", value: formatAmount(fields.discount, fields.currency) });
  if (fields.total !== undefined) rows.push({ label: "Total", value: formatAmount(fields.total, fields.currency) });
  if (fields.balance !== undefined) rows.push({ label: "Balance", value: formatAmount(fields.balance, fields.currency) });
  if (fields.invoiceNumber) rows.push({ label: "Invoice Number", value: fields.invoiceNumber });
  if (fields.receiptNumber) rows.push({ label: "Receipt Number", value: fields.receiptNumber });
  if (fields.accountNumber) rows.push({ label: "Account Number", value: fields.accountNumber });
  if (fields.referenceNumber) rows.push({ label: "Reference Number", value: fields.referenceNumber });
  if (fields.paymentMethod) rows.push({ label: "Payment Method", value: fields.paymentMethod });
  if (fields.issueDate) rows.push({ label: "Issue Date", value: fields.issueDate });
  if (fields.dueDate) rows.push({ label: "Due Date", value: fields.dueDate });
  if (fields.statementPeriod) rows.push({ label: "Statement Period", value: `${fields.statementPeriod.start} to ${fields.statementPeriod.end}` });

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium">{row.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No structured fields could be extracted.</p>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs font-medium">
          Transactions Found ({fields.transactions.length})
        </span>
        {fields.transactions.length > 0 ? (
          <div className="flex flex-col gap-1">
            {fields.transactions.map((line, index) => (
              <div key={index} className="flex justify-between gap-2 text-xs">
                <span className="truncate">{line.description}</span>
                <span className="shrink-0">
                  {line.date} · {formatAmount(line.amount, fields.currency)} ({line.direction})
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">No transaction lines were extracted yet.</p>
        )}
      </div>
    </div>
  );
}
