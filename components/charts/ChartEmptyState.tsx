export default function ChartEmptyState({ message = "No data for this range yet." }: { message?: string }) {
  return (
    <div className="text-muted-foreground flex h-[200px] items-center justify-center text-center text-sm">
      {message}
    </div>
  );
}
