import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Source map upload only runs when Sentry build-time env vars are present
// (CI/production builds) — silent no-op locally, so `next build` works
// without a Sentry account configured. See
// docs/observability/10-production-monitoring-checklist.md.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
});
