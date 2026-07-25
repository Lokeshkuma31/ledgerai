import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only. Hides the concrete LLM vendor from the rest of the app —
 * callers only ever see generateText(prompt) -> text.
 */
export type AIProviderName =
  | "anthropic"
  | "openai"
  | "gemini"
  | "openrouter"
  | "ollama";

const COACH_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    goodHabits: { type: "array", items: { type: "string" } },
    watchOutFor: { type: "array", items: { type: "string" } },
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "goodHabits", "watchOutFor", "suggestions"],
  additionalProperties: false,
} as const;

async function callAnthropic(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    thinking: { type: "disabled" },
    output_config: {
      format: { type: "json_schema", schema: COACH_OUTPUT_SCHEMA },
    },
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Anthropic declined to generate a response");
  }
  const block = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!block) throw new Error("Anthropic response contained no text content");
  return block.text;
}

async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI request failed with status ${res.status}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("OpenAI response contained no text content");
  }
  return text;
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini request failed with status ${res.status}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Gemini response contained no text content");
  }
  return text;
}

async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter request failed with status ${res.status}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("OpenRouter response contained no text content");
  }
  return text;
}

async function callOllama(prompt: string): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3";

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama request failed with status ${res.status}`);
  }
  const data = await res.json();
  const text = data?.message?.content;
  if (typeof text !== "string") {
    throw new Error("Ollama response contained no text content");
  }
  return text;
}

const PROVIDERS: Record<AIProviderName, (prompt: string) => Promise<string>> =
  {
    anthropic: callAnthropic,
    openai: callOpenAI,
    gemini: callGemini,
    openrouter: callOpenRouter,
    ollama: callOllama,
  };

export async function generateText(prompt: string): Promise<string> {
  const providerName = (process.env.AI_PROVIDER ||
    "anthropic") as AIProviderName;
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unsupported AI provider: ${providerName}`);
  }
  return provider(prompt);
}
