import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — LedgerAI",
};

const LAST_UPDATED = "2026-08-06";

export default function TermsOfServicePage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: {LAST_UPDATED} (draft)</p>

      <h2>The service</h2>
      <p>
        LedgerAI is a personal financial intelligence platform: dashboards, budgeting, transaction tracking, and an
        AI Coach, optionally backed by data you connect from email, bank, or document providers.
      </p>

      <h2>Your account</h2>
      <p>
        You&apos;re responsible for keeping your credentials secure and for the accuracy of information you provide.
        One account per person unless otherwise agreed.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don&apos;t use the service to violate the law, attempt to access another user&apos;s data, or interfere with
        the platform&apos;s operation (including automated scraping or abuse of rate limits).
      </p>

      <h2>Financial data is not financial advice</h2>
      <p>
        The AI Coach and any dashboards, forecasts, or insights are informational only and do not constitute
        financial, tax, or legal advice. Verify anything material against your own records or a licensed
        professional.
      </p>

      <h2>Connected accounts</h2>
      <p>
        When you connect a third-party account (Gmail, Outlook, Yahoo, a bank, or a document source), you authorize
        LedgerAI to access data from that account per the scopes you approve during that provider&apos;s OAuth flow.
        You can disconnect at any time from Settings.
      </p>

      <h2>Termination</h2>
      <p>
        You may delete your account at any time. We may suspend or terminate accounts that violate these terms or
        pose a security risk to the platform.
      </p>

      <h2>Disclaimers &amp; limitation of liability</h2>
      <p>
        The service is provided &quot;as is.&quot; Exact liability limitations, warranty disclaimers, and
        governing-law/jurisdiction clauses will be finalized during legal review — do not rely on this draft as the
        binding terms.
      </p>

      <h2>Changes to these terms</h2>
      <p>We&apos;ll notify active users of material changes before they take effect.</p>

      <h2>Contact</h2>
      <p>Contact details to be added during legal review.</p>
    </>
  );
}
