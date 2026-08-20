import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/marketing/icons";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#stack", label: "Stack" },
];

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="LedgerAI home">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-ai font-heading text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.7)]">
            L
          </span>
          <span className="font-heading text-[15px] font-semibold tracking-tight">
            LedgerAI
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-foreground-subtle transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            nativeButton={false}
            render={
              <a
                href="https://github.com/Lokeshkuma31/ledgerai"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View source on GitHub"
              />
            }
          >
            <GithubIcon className="size-4" />
            GitHub
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href="/sign-in" />}>
            Sign in
          </Button>
        </div>
      </div>
    </header>
  );
}
