"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { getQueryClient } from "@/lib/react-query/query-client";

/** useState(() => ...) rather than a bare module-level client — matches
 * getQueryClient()'s own client/server split (a fresh client per
 * component-tree instance on first render, reused across re-renders of
 * this same provider, never shared across separate requests on the
 * server). DevTools only ever bundle in development (the package itself
 * no-ops its UI in production, but this keeps it out of the client
 * bundle entirely). */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  );
}
