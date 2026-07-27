import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { POLICY_DECISIONS } from "@/types/policy";
import type { NotificationCandidate, NotificationChannel, PolicyDecision } from "@/types/policy";

export const POLICY_DECISION_LABELS: Record<PolicyDecision, string> = {
  "notify-immediately": "Will Notify",
  "schedule-later": "Scheduled",
  "include-in-daily-briefing": "Daily Briefing",
  "include-in-weekly-summary": "Weekly Summary",
  silent: "Silent",
  dismiss: "Dismissed",
  expired: "Expired",
};

const DECISION_STYLES: Record<PolicyDecision, string> = {
  "notify-immediately": "bg-destructive/10 text-destructive",
  "schedule-later": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "include-in-daily-briefing": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "include-in-weekly-summary": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  silent: "bg-muted text-muted-foreground",
  dismiss: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  push: "Push",
  email: "Email",
  "dashboard-feed": "Dashboard Feed",
  "home-widget": "Home Widget",
  desktop: "Desktop",
  watch: "Watch",
  "voice-assistant": "Voice Assistant",
};

function formatRecommendedTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PolicyDecisionCard({
  candidate,
  onOverride,
}: {
  candidate: NotificationCandidate;
  /** Pass a PolicyDecision to override, or null to clear an existing override. */
  onOverride?: (id: string, decision: PolicyDecision | null) => void;
}) {
  const isOverridden = candidate.metadata.overriddenDecision !== undefined;
  const recommendedTime = formatRecommendedTime(candidate.recommendedTime);

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium">{candidate.title}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${DECISION_STYLES[candidate.policyDecision]}`}
          >
            {POLICY_DECISION_LABELS[candidate.policyDecision]}
            {isOverridden ? " (overridden)" : ""}
          </span>
        </div>
        <span className="text-muted-foreground text-xs">
          {candidate.sourceEngine} · Priority {candidate.priority}
          {recommendedTime ? ` · ${recommendedTime}` : ""}
        </span>
        <p className="text-sm">{candidate.summary}</p>
        <p className="text-muted-foreground text-xs">{candidate.reason}</p>
        {candidate.recommendedChannels.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {candidate.recommendedChannels.map((channel) => (
              <span
                key={channel}
                className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
              >
                {CHANNEL_LABELS[channel]}
              </span>
            ))}
          </div>
        )}
        {onOverride && (
          <div className="flex items-center justify-end gap-2 pt-1">
            {isOverridden && (
              <Button variant="ghost" size="xs" onClick={() => onOverride(candidate.id, null)}>
                Reset
              </Button>
            )}
            <Select
              value={candidate.policyDecision}
              onValueChange={(value) => value && onOverride(candidate.id, value as PolicyDecision)}
            >
              <SelectTrigger size="sm" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLICY_DECISIONS.map((decision) => (
                  <SelectItem key={decision} value={decision}>
                    {POLICY_DECISION_LABELS[decision]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
