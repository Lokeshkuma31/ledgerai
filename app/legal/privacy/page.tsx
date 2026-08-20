import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — LedgerAI",
};

const LAST_UPDATED = "2026-08-06";

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: {LAST_UPDATED} (draft)</p>

      <h2>What we collect</h2>
      <p>
        Account information (name, email), financial data you connect or enter (transactions, budgets, goals,
        merchant data), and connected-account metadata (which providers you&apos;ve linked, sync status — not the
        content of your emails or bank credentials themselves, which are handled via OAuth and never stored by us
        in plaintext).
      </p>

      <h2>How we use it</h2>
      <p>
        To operate the product: displaying your dashboard, running the AI Coach on your data, syncing connected
        accounts, and sending you operational notifications. We do not sell your data.
      </p>

      <h2>Third parties</h2>
      <ul>
        <li>Neon (database hosting)</li>
        <li>Upstash (rate limiting infrastructure — does not store your financial data)</li>
        <li>Cloudflare R2 (document storage)</li>
        <li>Inngest (background job processing)</li>
        <li>Sentry (error tracking — configured to avoid capturing financial data; see internal privacy review)</li>
        <li>PostHog (product analytics)</li>
        <li>Your chosen AI provider (Anthropic, OpenAI, Google, or OpenRouter) for AI Coach requests</li>
        <li>Google, Microsoft, and Yahoo, when you connect an account via OAuth</li>
      </ul>

      <h2>Data retention</h2>
      <p>Retained for as long as your account is active. See Account Deletion below for removal.</p>

      <h2>Your rights</h2>
      <p>
        You can request an export of your data or deletion of your account by contacting support (see the Support
        section of your account settings). We aim to fulfill export/deletion requests within a reasonable window —
        the exact SLA will be finalized during legal review.
      </p>

      <h2>Security</h2>
      <p>
        Connected-account tokens are encrypted at rest (AES-256-GCM). See our{" "}
        <a href="/legal/security" className="underline underline-offset-4">
          Security Policy
        </a>{" "}
        for more detail, if published, or contact support.
      </p>

      <h2>Contact</h2>
      <p>Questions about this policy: contact details to be added during legal review.</p>
    </>
  );
}
