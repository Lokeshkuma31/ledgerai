/**
 * Connection health validation — hourly cron, orchestrates
 * lib/connections/engine.ts::checkAndRecordHealth (the real,
 * production-grade health-check + persist path — unchanged) per active
 * connection. Dispatches ledger/connection.disconnected when a
 * connection's health check reveals it's no longer usable, matching
 * docs/job-platform/03-job-dependency-graph.md.
 */
import { registerSchedule } from "@/lib/jobs/scheduler";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";
import { serializeError } from "@/lib/jobs/retry";
import { checkAndRecordHealth } from "@/lib/connections/engine";
import { getAllStoredConnectionsUnscoped } from "@/repositories/connection-repository";

export const connectionValidate = registerSchedule(
  { id: "connection-validate", name: "Connection Health Validation", cron: "0 * * * *", retries: 2 },
  async ({ correlationId, step }) => {
    const connections = await step.run("list-connections", () => getAllStoredConnectionsUnscoped());
    let checked = 0;
    let disconnected = 0;
    const failures: { connectionId: string; error: unknown }[] = [];

    for (const connection of connections) {
      try {
        const record = await step.run(`check-${connection.id}`, () =>
          checkAndRecordHealth(connection.id, connection.userId),
        );
        checked += 1;
        if (record && (record.status === "authentication-failed" || record.status === "permission-revoked")) {
          disconnected += 1;
          await dispatch(
            "ledger/connection.disconnected",
            { organizationId: undefined, correlationId, connectionId: connection.id, provider: connection.provider },
            { id: buildKey("connection-disconnected", connection.id, new Date().toISOString().slice(0, 13)) },
          );
        }
      } catch (error) {
        failures.push({ connectionId: connection.id, error: serializeError(error) });
      }
    }

    return { checked, disconnected, failures };
  },
);
