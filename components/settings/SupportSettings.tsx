"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitFeedbackAction, type FeedbackCategory } from "@/lib/support/actions";

const CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: "bug", label: "Report a bug" },
  { id: "feedback", label: "General feedback" },
  { id: "question", label: "Question" },
];

function buildDiagnosticInfo(): string {
  if (typeof window === "undefined") return "";
  return [
    `URL: ${window.location.href}`,
    `User agent: ${navigator.userAgent}`,
    `Viewport: ${window.innerWidth}x${window.innerHeight}`,
    `Timestamp: ${new Date().toISOString()}`,
  ].join("\n");
}

export default function SupportSettings() {
  const [category, setCategory] = useState<FeedbackCategory>("feedback");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const result = await submitFeedbackAction({ category, message, diagnosticInfo: buildDiagnosticInfo() });
      if (result.ok) {
        setStatus("sent");
        setMessage("");
      } else {
        setStatus("error");
        setError(result.error ?? "Something went wrong — please try again.");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
    }
  }

  async function handleCopyDiagnostics() {
    await navigator.clipboard.writeText(buildDiagnosticInfo());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { handleSubmit(e).catch(() => undefined); }} className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    category === c.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's going on?"
              rows={4}
              maxLength={4000}
              required
            />
            {status === "error" && error && <p className="text-sm text-destructive">{error}</p>}
            {status === "sent" && <p className="text-sm text-emerald-600 dark:text-emerald-400">Thanks — we&apos;ve received it.</p>}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={status === "sending" || !message.trim()}>
                {status === "sending" ? "Sending…" : "Send"}
              </Button>
              <p className="text-xs text-muted-foreground">Diagnostic info (page, browser, timestamp) is attached automatically.</p>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diagnostics &amp; contact</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            For security reports, use{" "}
            <a href="/legal/responsible-disclosure" className="underline underline-offset-4">
              Responsible Disclosure
            </a>{" "}
            instead of the form above.
          </p>
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => { handleCopyDiagnostics().catch(() => undefined); }}>
            {copied ? "Copied" : "Copy diagnostic info"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
