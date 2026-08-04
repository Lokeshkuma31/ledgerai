import { Skeleton } from "@/components/ui/skeleton";

/** Shown while useCurrentUser()'s initial fetch is in flight — mirrors
 * the shape of AppShell's own layout (sidebar + header + content) so
 * there's no layout shift once real data arrives. */
export function AuthSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-64 flex-col gap-3 border-r p-4 md:flex">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
