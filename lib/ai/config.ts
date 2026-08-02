import type { AIProviderName } from "@/lib/ai/provider";

const MODEL_ENV: Record<AIProviderName, string> = {
  anthropic: "ANTHROPIC_MODEL",
  openai: "OPENAI_MODEL",
  gemini: "GEMINI_MODEL",
  openrouter: "OPENROUTER_MODEL",
  ollama: "OLLAMA_MODEL",
};

const DEFAULT_MODEL: Record<AIProviderName, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  openrouter: "openai/gpt-4o-mini",
  ollama: "llama3",
};

/** Ollama has no API key concept (a local server) — omitted deliberately. */
const API_KEY_ENV: Partial<Record<AIProviderName, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export interface AIProviderSummary {
  provider: AIProviderName;
  model: string;
  /** Whether a key is configured — never the key's value itself. */
  hasApiKey: boolean;
}

/**
 * Read-only summary of the AI provider config lib/ai/provider.ts already
 * resolves at call time. There's no settings UI to change this — it's
 * env/config-driven only — so Settings' AI panel displays this rather than
 * offering an edit form with nothing to persist it to.
 */
export function getAIProviderSummary(): AIProviderSummary {
  const provider = (process.env.AI_PROVIDER as AIProviderName) || "anthropic";
  const model = process.env[MODEL_ENV[provider]] || DEFAULT_MODEL[provider];
  const keyEnv = API_KEY_ENV[provider];
  const hasApiKey = keyEnv ? Boolean(process.env[keyEnv]) : true;
  return { provider, model, hasApiKey };
}
