import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy — LedgerAI",
};

const LAST_UPDATED = "2026-08-06";

export default function CookiePolicyPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Cookie Policy</h1>
      <p className="text-muted-foreground">Last updated: {LAST_UPDATED} (draft)</p>

      <h2>Essential cookies</h2>
      <p>
        A session cookie (set by our authentication provider, Better Auth) keeps you signed in. Without it, the app
        can&apos;t function — there&apos;s no opt-out for this category, consistent with most jurisdictions&apos;
        cookie-consent exemptions for strictly-necessary cookies.
      </p>

      <h2>Analytics cookies</h2>
      <p>
        PostHog sets cookies/local-storage identifiers to understand product usage (which features get used, where
        users drop off) so we can improve the app. These are not used for advertising and are not sold or shared
        with ad networks.
      </p>

      <h2>Your choices</h2>
      <p>
        A consent banner for analytics cookies (accept/reject, jurisdiction-appropriate) is tracked as a launch
        requirement — see{" "}
        <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">
          docs/production-readiness-v2/08-launch-checklist.md
        </code>
        . Until it ships, analytics cookies are set on first visit; you can block them via your browser&apos;s
        cookie settings at any time.
      </p>

      <h2>Third-party cookies</h2>
      <p>
        OAuth providers (Google, Microsoft, Yahoo) may set their own cookies during the connection flow, governed by
        their own cookie policies.
      </p>
    </>
  );
}
