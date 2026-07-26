import { answerFinancialQuery } from "@/lib/coach/coach";
import { buildFinancialIndex } from "@/lib/index";
import { buildQueryContext } from "@/lib/query/context-builder";
import { detectIntent } from "@/lib/query/intent";
import { buildExecutionPlan } from "@/lib/query/planner";
import { routeExecution } from "@/lib/query/router";
import type { QueryDataSources, QueryResult } from "@/types/query";

/**
 * Financial Query Engine — the only path from a user's natural-language
 * question to an answer. Every stage is independent and deterministic
 * (Intent Detection -> Planning -> Routing -> Execution -> Context
 * Building); only the final step hands the AI Financial Coach a
 * structured context object to explain. The LLM never sees a raw
 * transaction it wasn't explicitly given, and never searches or
 * calculates anything itself.
 *
 * Execution itself is index-first: the Financial Semantic Index is built
 * from the same data sources and consulted before any executor touches a
 * raw engine array directly, so a question narrows to relevant objects
 * before their full detail is retrieved.
 */
export async function answerQuery(
  question: string,
  data: QueryDataSources,
): Promise<QueryResult> {
  const knownMerchantNames = data.merchantProfiles.map((m) => m.canonicalName);
  const detected = detectIntent(question, knownMerchantNames, data.now);
  const plan = buildExecutionPlan(detected);
  const index = buildFinancialIndex(data);
  const rawResult = routeExecution(plan, data, index);
  const context = buildQueryContext(plan, rawResult);

  let answer: string;
  try {
    answer = await answerFinancialQuery(question, plan.intent, context);
  } catch {
    answer =
      "I couldn't reach the AI Coach to explain this right now, but here's what I found — " +
      JSON.stringify(context);
  }

  return {
    id: crypto.randomUUID(),
    question,
    intent: plan.intent,
    answer,
    context,
    createdAt: data.now.toISOString(),
  };
}
