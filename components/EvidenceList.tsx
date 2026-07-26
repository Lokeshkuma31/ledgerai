import type { EvidenceItem } from "@/types/explanation";

export default function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  if (evidence.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1">
      {evidence.map((item, index) => (
        <li key={`${item.label}:${index}`} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-medium">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
