import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Responsible Disclosure — LedgerAI",
};

const LAST_UPDATED = "2026-08-06";

export default function ResponsibleDisclosurePage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Responsible Disclosure</h1>
      <p className="text-muted-foreground">Last updated: {LAST_UPDATED} (draft)</p>

      <p>
        We take security seriously and welcome reports from security researchers. If you believe you&apos;ve found
        a vulnerability in LedgerAI, please report it privately rather than disclosing it publicly.
      </p>

      <h2>How to report</h2>
      <p>
        A dedicated security-contact address (e.g. <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">security@</code>{" "}
        the production domain) will be published here before launch — see the Emergency Contacts table in{" "}
        <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">
          docs/production-readiness-v2/06-operational-runbook.md
        </code>
        , which currently has this contact marked as TBD pending assignment.
      </p>

      <h2>What to include</h2>
      <ul>
        <li>A description of the vulnerability and its potential impact</li>
        <li>Steps to reproduce, or a proof of concept</li>
        <li>Any relevant logs, screenshots, or affected URLs</li>
      </ul>

      <h2>What we ask</h2>
      <ul>
        <li>Give us a reasonable time to investigate and remediate before any public disclosure</li>
        <li>Avoid accessing, modifying, or exfiltrating other users&apos; data — a proof of concept against your own test account is sufficient</li>
        <li>Don&apos;t run automated scanners or load tests against production without prior coordination</li>
      </ul>

      <h2>What you can expect from us</h2>
      <p>
        Acknowledgement of your report and a good-faith effort to remediate confirmed issues in a timely manner,
        per severity. Exact response-time SLAs will be finalized during legal review.
      </p>
    </>
  );
}
