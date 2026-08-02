import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/categoryIcons";

export default function CategoryIcon({
  category,
  className,
}: {
  category: string | undefined;
  className?: string;
}) {
  const Icon = getCategoryIcon(category);
  return <Icon className={cn("text-muted-foreground size-4", className)} aria-hidden="true" />;
}
