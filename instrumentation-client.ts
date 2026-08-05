/**
 * Sentry init for the browser. `instrumentation-client.ts` is Next.js's
 * client-side counterpart to instrumentation.ts (which only covers
 * server/edge) — Next.js loads it automatically; nothing imports this
 * file directly. Named this way (not sentry.client.config.ts) because
 * that older convention doesn't work under Turbopack. Uses
 * NEXT_PUBLIC_SENTRY_DSN since this file ships to the browser.
 */
import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled, sentrySharedOptions } from "@/lib/observability/sentry-shared";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isSentryEnabled(),
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  ...sentrySharedOptions,
});

// Required by the SDK to capture client-side navigation spans/errors —
// see app/global-error.tsx for the sibling piece (React render errors
// during SSR/RSC streaming, which this hook doesn't cover).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
