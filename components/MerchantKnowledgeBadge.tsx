export default function MerchantKnowledgeBadge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "muted";
}) {
  return (
    <span
      className={
        tone === "muted"
          ? "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
          : "bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs"
      }
    >
      {label}
    </span>
  );
}
