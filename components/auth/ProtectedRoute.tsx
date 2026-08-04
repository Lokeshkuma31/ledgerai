"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCurrentUser } from "@/hooks/auth/use-current-user";
import { UnauthorizedError } from "@/lib/api/errors";
import { AuthSkeleton } from "@/components/auth/AuthSkeleton";
import { ErrorState } from "@/components/shared/ErrorState";

/**
 * A client-side complement to middleware.ts's cookie-presence check, not
 * a replacement for it — middleware already redirects a signed-out
 * visitor before this ever mounts. This exists for the case middleware
 * can't cover: a session that expires *while the page is already open*
 * (React Query's background refetch surfaces the 401 here, mid-session,
 * where middleware can't intervene since it only runs on navigation).
 *
 * Wrap a page's client content with this rather than duplicating the
 * loading/error/redirect handling in every page.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useCurrentUser();

  useEffect(() => {
    if (query.error instanceof UnauthorizedError) {
      router.replace(`/sign-in?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [query.error, router, pathname]);

  if (query.isLoading) return <AuthSkeleton />;

  if (query.error instanceof UnauthorizedError) {
    // Redirect is already in flight (the effect above) — render nothing
    // rather than a flash of an error state for what's actually a normal
    // sign-out/expiry transition.
    return null;
  }

  if (query.error) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} className="m-6" />;
  }

  return <>{children}</>;
}
