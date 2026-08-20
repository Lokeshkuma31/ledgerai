import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal — LedgerAI",
};

const LEGAL_PAGES = [
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/cookies", label: "Cookie Policy" },
  { href: "/legal/security", label: "Security Policy" },
  { href: "/legal/responsible-disclosure", label: "Responsible Disclosure" },
];

/**
 * Shared wrapper for all public legal pages. Deliberately outside
 * app/(app) — these must be reachable by signed-out visitors and by
 * middleware.ts's PROTECTED_PATHS allowlist (not listed there, so it's
 * public by default).
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          LedgerAI
        </Link>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          {LEGAL_PAGES.map((page) => (
            <Link key={page.href} href={page.href} className="hover:text-foreground hover:underline">
              {page.label}
            </Link>
          ))}
        </nav>
      </div>

      <div
        role="note"
        className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
      >
        <strong>Draft — pending legal review.</strong> This page is a structural placeholder prepared for the
        production-readiness launch checklist (see{" "}
        <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">
          docs/production-readiness-v2/08-launch-checklist.md
        </code>
        ). It must be reviewed and approved by qualified legal counsel before this app accepts real users — do not
        treat this text as binding until that review is complete and this banner is removed.
      </div>

      <article className="flex flex-col gap-4 text-sm leading-relaxed text-foreground [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        {children}
      </article>
    </div>
  );
}
