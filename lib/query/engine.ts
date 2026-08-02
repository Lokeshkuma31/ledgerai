import { answerFinancialQuery } from "@/lib/coach/coach";
import { buildQueryResponseExplanation } from "@/lib/explanations/builder";
import { explainQueryResponse } from "@/lib/explanations/engine";
import { buildFinancialIndex } from "@/lib/index";
import { buildQueryContext } from "@/lib/query/context-builder";
import { detectIntent } from "@/lib/query/intent";
import { buildExecutionPlan } from "@/lib/query/planner";
import { routeExecution } from "@/lib/query/router";
import type { Explanation, ExplanationContext, ExplanationCoachSummary } from "@/types/explanation";
import type { QueryDataSources, QueryResult } from "@/types/query";

function toExplanationContext(data: QueryDataSources): ExplanationContext {
  return {
    transactions: data.transactions,
    budgets: data.budgets,
    events: data.events,
    recommendations: data.recommendations,
    recurring: data.recurring,
    merchantProfiles: data.merchantProfiles,
    forecast: data.forecast,
    insights: data.insights,
    timeline: data.timeline,
    now: data.now,
  };
}

function toCoachSummary(explanation: Explanation): ExplanationCoachSummary {
  return {
    objectType: explanation.objectType,
    title: explanation.title,
    reason: explanation.reason,
    supportingEvidence: explanation.supportingEvidence,
    confidence: explanation.confidence,
  };
}

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
 *
 * The Financial Insight & Explanation Engine attaches a structured
 * explanation (reason, evidence, confidence) to every response — the
 * Coach receives it as part of its context and explains it in natural
 * language rather than deriving its own reasoning from `context`.
 */
export async function answerQuery(
  question: string,
  data: QueryDataSources,
): Promise<QueryResult> {
  const knownMerchantNames = data.merchantProfiles.map((m) => m.canonicalName);
  const detected = detectIntent(question, knownMerchantNames, data.now);
  const plan = buildExecutionPlan(detected);
  // Past conversation history may already carry an attached explanation
  // (see the end of this function) — reuse those rather than regenerating
  // the whole explanation set on every query.
  const priorExplanations: Explanation[] = data.conversationHistory
    .map((c) => c.explanation)
    .filter((e): e is Explanation => e !== undefined);
  const index = buildFinancialIndex({ ...data, explanations: priorExplanations });
  const rawResult = routeExecution(plan, data, index);
  const context = buildQueryContext(plan, rawResult);

  const explanationContext = toExplanationContext(data);
  const id = crypto.randomUUID();
  const createdAt = data.now.toISOString();

  // A pre-answer explanation (reason/evidence/confidence never depend on
  // the Coach's own output) is handed to the Coach as part of its
  // context — it explains the number, the Coach never has to.
  const draftExplanation = buildQueryResponseExplanation(
    { id, question, intent: plan.intent, answer: "", context, createdAt },
    explanationContext,
  );
  context.explanation = toCoachSummary(draftExplanation);

  let answer: string;
  try {
    answer = await answerFinancialQuery(question, plan.intent, context);
  } catch {
    answer =
      "I couldn't reach the AI Coach to explain this right now, but here's what I found — " +
      JSON.stringify(context);
  }

  const result: QueryResult = {
    id,
    question,
    intent: plan.intent,
    answer,
    context,
    createdAt,
    requiredEngines: plan.requiredEngines,
  };
  result.explanation = explainQueryResponse(result, explanationContext);
  return result;
}
