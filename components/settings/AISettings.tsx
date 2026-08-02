import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AIProviderSummary } from "@/lib/ai/config";

const PROVIDER_LABELS: Record<AIProviderSummary["provider"], string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  ollama: "Ollama (local)",
};

/** Read-only — there's no persistence layer to save an edited provider/model
 * to (it's resolved from environment variables at call time, see
 * lib/ai/provider.ts), so this displays the active configuration rather
 * than offering a form with nothing to submit to. */
export default function AISettings({ summary }: { summary: AIProviderSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          The AI Coach and Financial Copilot are configured via environment
          variables, not this page.
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Provider</span>
          <span className="font-medium">{PROVIDER_LABELS[summary.provider]}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Model</span>
          <span className="font-numeric font-medium">{summary.model}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">API Key</span>
          <Badge variant={summary.hasApiKey ? "success" : "warning"}>
            {summary.hasApiKey ? "Configured" : "Missing"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
