import Link from "next/link";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav";
import { GithubIcon } from "@/components/marketing/icons";

const LEGAL_LINKS = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/security", label: "Security" },
  { href: "/legal/responsible-disclosure", label: "Responsible disclosure" },
];

// Reuses the same nav data the authenticated app sidebar renders from
// (lib/nav.ts), so this footer sitemap can't drift out of sync with it.
const PRODUCT_GROUPS = NAV_GROUPS.filter((g) => g !== "System");

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="flex items-center gap-2.5" aria-label="LedgerAI home">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-ai text-xs font-bold text-white">
                L
              </span>
              <span className="font-heading text-sm font-semibold">LedgerAI</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-foreground-subtle">
              A hobby project exploring what an AI-native finance app could look like.
            </p>
            <a
              href="https://github.com/Lokeshkuma31/ledgerai"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground-subtle transition-colors hover:text-foreground"
            >
              <GithubIcon className="size-4" />
              Source on GitHub
            </a>
          </div>

          {PRODUCT_GROUPS.map((group) => (
            <nav key={group} aria-label={group}>
              <h3 className="text-xs font-semibold tracking-wide text-foreground-subtle uppercase">
                {group}
              </h3>
              <ul className="mt-3 space-y-2.5">
                {NAV_ITEMS.filter((item) => item.group === group).map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="text-sm text-foreground-subtle transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label="Legal">
            <h3 className="text-xs font-semibold tracking-wide text-foreground-subtle uppercase">
              Legal
            </h3>
            <ul className="mt-3 space-y-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-foreground-subtle transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border/60 pt-6 text-xs text-foreground-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} LedgerAI. Built as a personal/portfolio project.</p>
          <p>Next.js &middot; Prisma &middot; Neon &middot; Inngest &middot; Anthropic Claude</p>
        </div>
      </div>
    </footer>
  );
}
