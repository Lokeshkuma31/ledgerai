import type { EmailAttachmentMeta } from "@/lib/email/types";

const KIND_LABELS: Record<EmailAttachmentMeta["kind"], string> = {
  pdf: "PDF",
  image: "Image",
  csv: "CSV",
  text: "Text",
};

export default function AttachmentList({ attachments }: { attachments: EmailAttachmentMeta[] }) {
  if (attachments.length === 0) {
    return <p className="text-muted-foreground text-xs">No attachments.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium">Attachments ({attachments.length})</span>
      {attachments.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate">{a.fileName}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 whitespace-nowrap">{KIND_LABELS[a.kind]}</span>
            <span
              className={`rounded-full px-2 py-0.5 whitespace-nowrap ${
                a.documentId ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
              }`}
            >
              {a.documentId ? "Parsed" : "Not parsed"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
