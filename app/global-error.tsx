"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Next.js App Router convention: replaces the ENTIRE root layout (not
 * just a subtree) when an error escapes every nested error.tsx boundary
 * during React rendering — the one class of error
 * lib/api/error-handler.ts's handleApiError/handleActionError can never
 * see, since those only run for thrown Route Handler/Server Action
 * errors, not render errors. Kept deliberately minimal/self-contained
 * (no app providers, no custom fonts) since it must still render
 * correctly if the app's own providers are what broke.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Something went wrong.</h1>
          <p style={{ color: "#6b7280", marginBottom: "1rem" }}>
            We&apos;ve been notified and are looking into it. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid #6b7280", cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
