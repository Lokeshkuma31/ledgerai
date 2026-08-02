import type { FeedSeverity } from "@/types/feed";

export const ATTENTION_DOMAINS = ["budget", "bill", "connection", "feed"] as const;
export type AttentionDomain = (typeof ATTENTION_DOMAINS)[number];

/**
 * One row in the Dashboard's "Needs Attention" section — a normalized
 * projection over several already-computed engine outputs (budgets,
 * recurring, the Feed, connection health), ranked by severity so the
 * Dashboard can answer "what should I do right now" from a single ranked
 * list instead of several separately-styled widgets. Reuses FeedSeverity
 * (rather than inventing a new severity type) specifically so it renders
 * through the existing, unmodified SeverityBadge component.
 */
export interface AttentionItem {
  id: string;
  domain: AttentionDomain;
  severity: FeedSeverity;
  title: string;
  summary: string;
  ctaHref: string;
  ctaLabel: string;
  relatedObjectIds: string[];
}
