/**
 * Central function registry — every Inngest function the platform
 * registers, aggregated into one flat array for app/api/inngest/route.ts's
 * serve() call. Adding a new job means adding it to the relevant
 * lib/jobs/functions/*.ts file and importing it here — nothing else
 * changes (dispatcher.ts, scheduler.ts, and this file's own iteration
 * logic stay untouched). See docs/job-platform/02-event-catalog.md §2.3.
 */
import "server-only";

import { classification } from "./functions/transactions";
import { merchantNormalize } from "./functions/merchants";
import { documentParse } from "./functions/documents";
import { syncStart, syncRun } from "./functions/sync";
import { workflowExecute } from "./functions/workflows";
import { feedGenerate } from "./functions/feed";
import { notificationGenerate } from "./functions/notifications";
import {
  recurringDetect,
  forecastRefresh,
  budgetRecalculate,
  analyticsRefresh,
  recommendationGenerate,
} from "./functions/scheduled";
import { searchIndex, semanticIndex } from "./functions/search";
import { briefingTick, summaryGenerate } from "./functions/summaries";
import { cleanup } from "./functions/cleanup";
import { connectionValidate } from "./functions/connections";
import { pluginHealthCheck } from "./functions/plugins";

export const functions = [
  classification,
  merchantNormalize,
  documentParse,
  syncStart,
  syncRun,
  workflowExecute,
  feedGenerate,
  notificationGenerate,
  recurringDetect,
  forecastRefresh,
  budgetRecalculate,
  analyticsRefresh,
  recommendationGenerate,
  searchIndex,
  semanticIndex,
  briefingTick,
  summaryGenerate,
  cleanup,
  connectionValidate,
  pluginHealthCheck,
];
