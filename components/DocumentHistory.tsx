import ImportStatusBadge from "@/components/ImportStatusBadge";
import OCRConfidenceBadge from "@/components/OCRConfidenceBadge";
import type { DocumentRecord } from "@/plugins/document-intelligence/types";

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

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function DocumentHistory({ documents }: { documents: DocumentRecord[] }) {
  if (documents.length === 0) {
    return <p className="text-muted-foreground text-sm">No documents processed yet.</p>;
  }

  const sorted = [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  return (
    <div className="max-h-96 overflow-y-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground sticky top-0">
          <tr>
            <th className="px-2 py-1.5 font-medium">Uploaded</th>
            <th className="px-2 py-1.5 font-medium">File</th>
            <th className="px-2 py-1.5 font-medium">Type</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
            <th className="px-2 py-1.5 font-medium">Confidence</th>
            <th className="px-2 py-1.5 text-right font-medium">Transactions</th>
            <th className="px-2 py-1.5 font-medium">Duplicate</th>
            <th className="px-2 py-1.5 font-medium">Errors</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((doc) => (
            <tr key={doc.id} className="border-t">
              <td className="px-2 py-1.5 whitespace-nowrap">{formatTimestamp(doc.uploadedAt)}</td>
              <td className="px-2 py-1.5">{doc.fileName}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{TYPE_LABELS[doc.documentType]}</td>
              <td className="px-2 py-1.5">
                <ImportStatusBadge status={doc.status} />
              </td>
              <td className="px-2 py-1.5">
                <OCRConfidenceBadge confidence={doc.extractionConfidence} label="" />
              </td>
              <td className="px-2 py-1.5 text-right">{doc.linkedTransactionIds.length}</td>
              <td className="px-2 py-1.5">{doc.isDuplicate ? "Yes" : "—"}</td>
              <td className="px-2 py-1.5" title={doc.validationErrors.map((e) => e.message).join("; ")}>
                {doc.validationErrors.length > 0 ? doc.validationErrors.length : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
