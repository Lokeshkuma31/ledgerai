import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security Policy — LedgerAI",
};

const LAST_UPDATED = "2026-08-06";

export default function SecurityPolicyPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Security Policy</h1>
      <p className="text-muted-foreground">Last updated: {LAST_UPDATED} (draft)</p>

      <h2>How we protect your data</h2>
      <ul>
        <li>Connected-account OAuth tokens are encrypted at rest with AES-256-GCM.</li>
        <li>Every authenticated route is protected against IDOR by organization/membership-scoped queries.</li>
        <li>All traffic is served over HTTPS/TLS with HSTS enabled.</li>
        <li>Security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) are applied to every response.</li>
        <li>Rate limiting protects authentication, OAuth callback, upload, and connection-mutation endpoints.</li>
        <li>Every security-relevant action (auth events, connection lifecycle changes) is written to an audit log.</li>
        <li>Dependencies are scanned for known vulnerabilities on every change (see our public dependency audit process).</li>
      </ul>

      <h2>Reporting a vulnerability</h2>
      <p>
        If you believe you&apos;ve found a security issue, please see our{" "}
        <a href="/legal/responsible-disclosure" className="underline underline-offset-4">
          Responsible Disclosure
        </a>{" "}
        page rather than filing a public issue or support ticket.
      </p>

      <h2>Scope note</h2>
      <p>
        This page summarizes technical controls already implemented in the codebase (see{" "}
        <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">
          docs/production-readiness-v2/04-security-verification-report.md
        </code>{" "}
        and <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">docs/security-hardening/</code>) — it
        will be reviewed and formalized (including SLA commitments and compliance-framework references, if any)
        during legal review before launch.
      </p>
    </>
  );
}
