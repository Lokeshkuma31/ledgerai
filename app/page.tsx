import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  Landmark,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { GithubIcon } from "@/components/marketing/icons";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: `${SITE_NAME} — Your AI-native personal finance copilot`,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    id: "ai-coach",
    icon: Sparkles,
    title: "AI Coach",
    description:
      "Ask questions about your money in plain English — \"Where did my food spend go this month?\" — and get answers grounded in your real transactions, not generic tips.",
    span: "sm:col-span-2",
    accent: "ai" as const,
  },
  {
    id: "sync",
    icon: RefreshCw,
    title: "Auto-sync",
    description: "Connects banks and email receipts, dedupes, and categorizes on its own.",
    span: undefined,
    accent: "primary" as const,
  },
  {
    id: "budgets",
    icon: PiggyBank,
    title: "Budgets & goals",
    description: "Set a target, watch progress update itself as transactions land.",
    span: undefined,
    accent: "success" as const,
  },
  {
    id: "forecast",
    icon: TrendingUp,
    title: "Forecasting",
    description: "Cash-flow projections built from your actual spending pattern.",
    span: undefined,
    accent: "warning" as const,
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "Analytics",
    description: "Category trends and merchant breakdowns that update in real time.",
    span: undefined,
    accent: "primary" as const,
  },
  {
    id: "security",
    icon: ShieldCheck,
    title: "Security-first",
    description: "Encrypted connections, audited access, rate-limited APIs by default.",
    span: "sm:col-span-2",
    accent: "success" as const,
  },
] as const;

const ACCENT_CLASSES: Record<string, string> = {
  ai: "bg-ai/10 text-ai",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
};

const STEPS = [
  {
    number: "01",
    title: "Connect",
    description: "Link a bank or an inbox. Nothing manual, nothing to re-type.",
  },
  {
    number: "02",
    title: "Sync",
    description: "Background jobs pull, dedupe, and categorize every transaction.",
  },
  {
    number: "03",
    title: "Understand",
    description: "Budgets, forecasts, and an AI coach turn the data into decisions.",
  },
];

const STACK = [
  "Next.js 15",
  "React 19",
  "TypeScript",
  "Prisma",
  "Neon Postgres",
  "Inngest",
  "Upstash Redis",
  "Cloudflare R2",
  "Anthropic Claude",
  "Sentry",
  "OpenTelemetry",
  "PostHog",
  "Tailwind CSS",
  "shadcn/ui",
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <MarketingNav />

      <main id="main-content" className="flex-1">
        {/* ── Hero ───────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_40%,transparent_100%)]"
          >
            <div className="absolute top-[-15%] left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 animate-pulse-slow rounded-full bg-primary/40 blur-[130px]" />
            <div className="absolute top-[5%] right-[5%] h-[26rem] w-[26rem] rounded-full bg-ai/40 blur-[120px]" />
            <div className="absolute top-[15%] left-[8%] h-[18rem] w-[18rem] rounded-full bg-success/25 blur-[100px]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:56px_56px] opacity-[0.25]" />
          </div>

          <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28 sm:pb-24">
            <Badge
              variant="ai"
              className="mb-6 h-auto rounded-full border border-ai/30 px-3 py-1 shadow-[0_0_24px_-8px_var(--ai)]"
            >
              <Sparkles className="size-3" />
              Built solo, powered by Claude
            </Badge>

            <h1 className="font-heading text-5xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl md:text-7xl lg:text-8xl">
              Your money,
              <br />
              <span className="bg-gradient-to-r from-primary via-ai to-primary bg-clip-text text-transparent drop-shadow-[0_0_60px_rgba(124,58,237,0.35)]">
                finally understood.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base text-foreground-subtle sm:text-lg">
              {SITE_NAME} connects your banks and email, categorizes every transaction on
              its own, and lets you ask an AI coach where your money actually goes.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Button
                size="lg"
                className="h-11 px-6 text-sm"
                nativeButton={false}
                render={<Link href="/dashboard" />}
              >
                Get started
                <ArrowRight />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 px-6 text-sm"
                nativeButton={false}
                render={
                  <a
                    href="https://github.com/Lokeshkuma31/ledgerai"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <GithubIcon className="size-4" />
                View source
              </Button>
            </div>

            <p className="mt-5 text-xs text-foreground-subtle">
              Open source &middot; No credit card &middot; Self-hosted friendly
            </p>
          </div>
        </section>

        {/* ── Tech strip (marquee) ──────────────────────────────── */}
        <section id="stack" aria-label="Built with" className="border-y border-border/60 py-6">
          <div className="group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
            <ul className="flex shrink-0 animate-marquee items-center gap-8 pr-8 group-hover:[animation-play-state:paused]">
              {STACK.map((tech) => (
                <li
                  key={tech}
                  className="shrink-0 text-sm font-medium whitespace-nowrap text-foreground-subtle"
                >
                  {tech}
                </li>
              ))}
            </ul>
            <ul
              aria-hidden
              className="flex shrink-0 animate-marquee items-center gap-8 pr-8 group-hover:[animation-play-state:paused]"
            >
              {STACK.map((tech) => (
                <li
                  key={tech}
                  className="shrink-0 text-sm font-medium whitespace-nowrap text-foreground-subtle"
                >
                  {tech}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Feature bento grid ────────────────────────────────── */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Everything your bank&rsquo;s app won&rsquo;t do
            </h2>
            <p className="mt-4 text-foreground-subtle">
              A focused set of tools that turn scattered statements into a single, honest
              picture of your finances.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div
                key={feature.id}
                className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_16px_40px_-24px_rgba(37,99,235,0.35)] ${feature.span ?? ""}`}
              >
                <div
                  className={`mb-4 flex size-10 items-center justify-center rounded-xl ${ACCENT_CLASSES[feature.accent]}`}
                >
                  <feature.icon className="size-5" />
                </div>
                <h3 className="font-heading text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-foreground-subtle">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────── */}
        <section
          id="how-it-works"
          className="border-t border-border/60 bg-surface-2/40 py-20 sm:py-28"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Three steps. Then it just runs.
              </h2>
            </div>

            <div className="relative mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((step) => (
                <div key={step.number} className="relative flex flex-col items-start">
                  <span className="font-numeric text-4xl font-bold text-primary/30">
                    {step.number}
                  </span>
                  <h3 className="mt-3 font-heading text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-foreground-subtle">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Bank-grade infra note ─────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-col items-center gap-8 rounded-3xl border border-border bg-gradient-to-br from-card to-surface-2 p-8 text-center sm:p-14">
            <Landmark className="size-8 text-primary" />
            <h2 className="max-w-xl font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Built like a production app, run as a portfolio project.
            </h2>
            <p className="max-w-lg text-sm text-foreground-subtle">
              Real background job processing, structured logging and tracing, CI/CD, and a
              documented deployment and incident-response process — the same shape as a
              production fintech app, built to learn how one actually holds together.
            </p>
            <Button
              size="lg"
              className="h-11 px-6 text-sm"
              nativeButton={false}
              render={
                <a
                  href="https://github.com/Lokeshkuma31/ledgerai"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Explore the code
              <ArrowRight />
            </Button>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
