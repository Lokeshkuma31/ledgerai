"use client";

import { AlertTriangle, Ban, Clock, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ForbiddenError,
  NetworkError,
  NotFoundError,
  RateLimitedError,
  TimeoutError,
  UnauthorizedError,
} from "@/lib/api/errors";

interface ErrorPresentation {
  icon: typeof AlertTriangle;
  title: string;
  description: string;
}

/** One presentation per error code — every domain's failed query/mutation
 * renders through this, so "your session expired" never looks different
 * on the Transactions page than it does here. Unmapped/500 errors fall
 * through to the generic case at the bottom. */
function presentationFor(error: unknown): ErrorPresentation {
  if (error instanceof UnauthorizedError) {
    return { icon: ShieldAlert, title: "Your session expired", description: "Sign in again to continue." };
  }
  if (error instanceof ForbiddenError) {
    return { icon: Ban, title: "You don't have access", description: error.message };
  }
  if (error instanceof NotFoundError) {
    return { icon: AlertTriangle, title: "Not found", description: error.message };
  }
  if (error instanceof RateLimitedError) {
    return { icon: Clock, title: "Slow down", description: error.message };
  }
  if (error instanceof NetworkError) {
    return { icon: WifiOff, title: "Connection lost", description: error.message };
  }
  if (error instanceof TimeoutError) {
    return { icon: Clock, title: "That took too long", description: error.message };
  }
  return {
    icon: AlertTriangle,
    title: "Something went wrong",
    description: "We hit an unexpected error. Please try again.",
  };
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { icon: Icon, title, description } = presentationFor(error);

  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center ${className ?? ""}`}>
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2 gap-2">
          <RefreshCw className="size-3.5" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}
