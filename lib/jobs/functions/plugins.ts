/**
 * Plugin health check job — 30-minute cron, calls each registered
 * plugin's own health() implementation (unchanged — every plugin
 * implements Plugin.health() itself, this job never inspects plugin
 * internals) and persists via services/plugins/plugin-service.ts::
 * recordPluginHealth.
 */
import { registerSchedule } from "@/lib/jobs/scheduler";
import { serializeError } from "@/lib/jobs/retry";
import { getAllPluginInstances } from "@/lib/plugins/registry";
import * as pluginService from "@/services/plugins/plugin-service";
import { captureFromContext } from "@/lib/observability/analytics";

export const pluginHealthCheck = registerSchedule(
  { id: "plugin-health-check", name: "Plugin Health Check", cron: "*/30 * * * *", retries: 2 },
  async ({ step }) => {
    const plugins = getAllPluginInstances();
    let checked = 0;
    const failures: { pluginId: string; error: unknown }[] = [];

    for (const plugin of plugins) {
      try {
        await step.run(`health-${plugin.id}`, async () => {
          const health = await plugin.health();
          await pluginService.recordPluginHealth(plugin.id, health);
          if (health.status !== "healthy") {
            captureFromContext("plugin_health_degraded", { plugin_id: plugin.id, status: health.status });
          }
        });
        checked += 1;
      } catch (error) {
        failures.push({ pluginId: plugin.id, error: serializeError(error) });
      }
    }

    return { checked, failures };
  },
);
