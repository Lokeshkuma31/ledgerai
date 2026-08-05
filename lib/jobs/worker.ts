/**
 * Worker — the single wrapper every job in lib/jobs/functions/*.ts is
 * built through. Composes tracking (JobRun lifecycle writes), retry
 * classification, dead-letter routing, and queue config into one
 * `defineJob()` call, so no individual function hand-rolls this
 * bookkeeping. Workers orchestrate existing services/*  and
 * lib/*\/engine.ts functions only — no business calculation lives here or
 * in any function body; see docs/job-platform/01-architecture-diagram.md
 * and docs/job-platform/08-worker-architecture.md §8.3.
 */
import "server-only";
import type { InngestFunction } from "inngest";
import { inngest } from "./engine";
import * as jobService from "@/services/jobs/job-service";
import { classifyError, throwClassified, retriesFor, buildFailureHandler, serializeError } from "./retry";

export interface JobContext<TData = Record<string, unknown>> {
  event: { id: string; name: string; data: TData };
  runId: string;
  attempt: number;
  organizationId?: string;
  correlationId: string;
  /** Writes JobRun.progress (0-100) — best-effort, never throws. See
   * docs/job-platform/08-worker-architecture.md §8.7. */
  reportProgress: (percent: number) => Promise<void>;
  /** Inngest's step tools (step.run/step.sleep/step.sendEvent/...) —
   * typed as `any` deliberately: the SDK's real type is a deeply generic
   * function of the client/middleware/trigger type parameters, which
   * isn't worth threading through every lib/jobs/functions/*.ts call
   * site. Each function still gets full autocomplete from Inngest's own
   * handler typing at the inngest.createFunction() call inside
   * defineJob(); this field only loosens the *re-exported* ctx shape. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  step: any;
}

export interface DefineJobConfig {
  /** Also JobRun.jobType and the Inngest function id — must stay stable
   * between deployments (Inngest uses it for run history/versioning).
   * Bump it (e.g. "sync-run-v2") for a breaking change to a job's
   * contract; see docs/job-platform/01-architecture-diagram.md's
   * "function versioning" note. */
  id: string;
  name?: string;
  /** Soft version marker folded into the display name — Inngest has no
   * native per-function version field; a breaking change should bump
   * `id` itself. This is for human-readable tracking only. */
  version?: number;
  trigger: NonNullable<InngestFunction.Options["triggers"]> | { event: string } | { cron: string };
  concurrency?: InngestFunction.Options["concurrency"];
  rateLimit?: InngestFunction.Options["rateLimit"];
  throttle?: InngestFunction.Options["throttle"];
  priority?: InngestFunction.Options["priority"];
  cancelOn?: InngestFunction.Options["cancelOn"];
  idempotency?: string;
  retries?: number;
}

export function defineJob<TData extends Record<string, unknown> = Record<string, unknown>>(
  config: DefineJobConfig,
  handler: (ctx: JobContext<TData>) => Promise<unknown>,
) {
  const jobType = config.id;

  return inngest.createFunction(
    {
      id: config.id,
      name: config.version ? `${config.name ?? config.id} (v${config.version})` : config.name,
      triggers: config.trigger as never,
      retries: (config.retries ?? retriesFor(jobType)) as InngestFunction.Options["retries"],
      concurrency: config.concurrency,
      rateLimit: config.rateLimit,
      throttle: config.throttle,
      priority: config.priority,
      cancelOn: config.cancelOn,
      idempotency: config.idempotency,
      onFailure: buildFailureHandler(jobType),
    },
    async (ctx) => {
      const { event, runId, step, attempt } = ctx as unknown as {
        event: { id: string; name: string; data: TData };
        runId: string;
        step: unknown;
        attempt: number;
      };
      const inngestEventId = event.id;
      const key = { jobType, inngestEventId };
      const data = event.data as Record<string, unknown>;
      const organizationId = typeof data.organizationId === "string" ? data.organizationId : undefined;
      const correlationId = typeof data.correlationId === "string" ? data.correlationId : crypto.randomUUID();

      await jobService.createQueued({
        jobType,
        eventName: event.name,
        inngestEventId,
        organizationId,
        correlationId,
        input: event.data,
      });
      await jobService.markRunning(key, runId, attempt);

      const reportProgress = async (percent: number) => {
        await jobService.setProgress(key, percent).catch(() => undefined);
      };

      try {
        const output = await handler({
          event,
          runId,
          attempt,
          organizationId,
          correlationId,
          reportProgress,
          step,
        });
        await jobService.markCompleted(key, output);
        return output;
      } catch (error) {
        const classification = classifyError(error);
        const willRetry = classification === "transient" && attempt < retriesFor(jobType);
        if (willRetry) {
          await jobService.markRetrying(key, attempt, serializeError(error)).catch(() => undefined);
        } else {
          await jobService.markFailed(key, serializeError(error), attempt).catch(() => undefined);
        }
        throwClassified(error);
      }
    },
  );
}
