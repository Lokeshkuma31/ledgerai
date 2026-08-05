/**
 * Core Inngest client — the one instance every other lib/jobs/* module and
 * every function in lib/jobs/functions/*.ts imports. See
 * docs/job-platform/01-architecture-diagram.md §1.4 for why Inngest (not
 * this module) owns the actual queue/broker/executor; everything here is
 * configuration.
 *
 * Event payloads are validated at the dispatch boundary via zod
 * (lib/jobs/events.ts), not via Inngest's own generic event-schema typing
 * — the installed SDK version's typed-event API (`EventSchemas`) isn't
 * exposed the way older Inngest docs describe, so runtime validation here
 * is what actually enforces "event schema validation" end to end.
 */
import "server-only";
import { Inngest } from "inngest";

export const JOB_PLATFORM_APP_ID = "ledgerai";

export const inngest = new Inngest({
  id: JOB_PLATFORM_APP_ID,
  eventKey: process.env.INNGEST_EVENT_KEY,
});
