/**
 * Event dispatch — the one entry point every route handler, server
 * action, and business engine uses to publish a domain event.
 * Route Handlers/Server Actions/the Workflow Engine/Plugins call
 * dispatch(); they never call an Inngest function or lib/jobs/worker.ts
 * directly (see docs/job-platform/01-architecture-diagram.md's
 * "Integration Patterns").
 *
 * JobRun rows are NOT created here — a single event can fan out to
 * several subscribing functions (see prisma/schema.prisma's JobRun
 * comment), so each function creates its own row on entry via
 * worker.ts's defineJob() wrapper. This module's only job is validating
 * the payload and hitting Inngest's send API with a deliberate event id.
 */
import "server-only";
import { inngest } from "./engine";
import { EVENT_SCHEMAS, type EventName, type EventPayload } from "./events";

export interface DispatchOptions {
  /** Explicit Inngest event id for broker-level dedup (docs/job-platform/
   * 04-queue-strategy.md §4.6) — build with lib/jobs/idempotency.ts's
   * buildKey(). Omit only for events where duplicate delivery is
   * genuinely harmless (fully idempotent by construction downstream). */
  id?: string;
}

/** Validates `data` against events.ts's zod schema, then sends it through
 * the Inngest client. `data.correlationId` should be threaded forward
 * from the triggering event when dispatching a follow-up event in a
 * chain (docs/job-platform/08-worker-architecture.md §8.4); pass a fresh
 * one only at the true start of a chain. */
export async function dispatch<N extends EventName>(
  name: N,
  data: Omit<EventPayload<N>, "correlationId"> & { correlationId?: string },
  options: DispatchOptions = {},
): Promise<{ ids: string[] }> {
  const payload = {
    ...data,
    correlationId: data.correlationId ?? crypto.randomUUID(),
  };
  const parsed = EVENT_SCHEMAS[name].parse(payload);

  const result = await inngest.send({
    id: options.id,
    name,
    data: parsed,
  });
  return { ids: result.ids };
}
