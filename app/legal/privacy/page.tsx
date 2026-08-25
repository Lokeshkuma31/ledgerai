import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — LedgerAI",
};

const LAST_UPDATED = "2026-08-25";

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
        You can export a copy of your transactions, budgets, goals, recurring rules, bank accounts, and AI Coach
        conversation history, or permanently delete your account, at any time from Settings → Privacy — both are
        immediate, self-service actions, not a support request. Deleting your account removes your organization and
        every transaction, budget, goal, connection, and document tied to it; this cannot be undone.
      </p>
      <p>
        If you are in India, these correspond to your rights as a Data Principal under the Digital Personal Data
        Protection Act, 2023 (DPDPA) — access, correction, and erasure of your personal data. If you believe your
        data has been processed unlawfully, you may reach our Grievance Officer using the contact details below
        before approaching the Data Protection Board of India.
      </p>
      <p>
        LedgerAI is intended for users aged 18 and over. We do not knowingly collect personal data from minors; if
        you believe a minor has created an account, contact us and we will delete it.
      </p>

      <h2>Security</h2>
      <p>
        Connected-account tokens are encrypted at rest (AES-256-GCM). See our{" "}
        <a href="/legal/security" className="underline underline-offset-4">
          Security Policy
        </a>{" "}
        for more detail.
      </p>

      <h2>Grievance Officer / Contact</h2>
      <p>
        For privacy questions, data-rights requests not covered by the self-service tools above, or grievances
        under the DPDPA: open an issue at{" "}
        <a
          href="https://github.com/Lokeshkuma31/ledgerai/issues"
          className="underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/Lokeshkuma31/ledgerai/issues
        </a>
        , the fastest route to the developer for this solo-built project. A dedicated grievance-officer email will
        be published here before any wider/commercial launch.
      </p>
    </>
  );
}
