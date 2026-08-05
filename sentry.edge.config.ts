/**
 * Sentry init for the Edge runtime — covers middleware.ts, which Next.js
 * runs on Edge by default. Loaded from instrumentation.ts's register()
 * when NEXT_RUNTIME==="edge". Imports only sentry-shared.ts (no
 * node:async_hooks dependency) — see that file's header for why.
 */
import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled, sentrySharedOptions } from "@/lib/observability/sentry-shared";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: isSentryEnabled(),
  tracesSampleRate: 0,
  ...sentrySharedOptions,
});
