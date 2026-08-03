import { Skeleton } from "@/components/ui/skeleton";

export default function ChartLoadingState() {
  return (
    <div className="flex h-[200px] flex-col justify-end gap-2 py-4">
      <Skeleton className="h-full w-full rounded-lg" />
    </div>
  );
}
