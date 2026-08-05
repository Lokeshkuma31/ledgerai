/**
 * Sentry init for the Node.js server runtime (Route Handlers, Server
 * Actions, Server Components, Inngest job functions all execute here).
 * Loaded from instrumentation.ts's register() when NEXT_RUNTIME==="nodejs".
 * Disabled by default outside production/preview so local dev doesn't
 * report test exceptions — see docs/observability/02-telemetry-strategy.md.
 */
import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled, sentrySharedOptions } from "@/lib/observability/sentry-shared";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: isSentryEnabled(),
  tracesSampleRate: 0, // OTel (lib/observability/tracing.ts) owns tracing; Sentry only captures errors.
  ...sentrySharedOptions,
});
