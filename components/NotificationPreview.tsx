"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import PolicyDecisionCard from "@/components/PolicyDecisionCard";
import { getAllFeedItems } from "@/lib/feed/registry";
import { evaluateNotificationPolicy } from "@/lib/policy/engine";
import { overrideDecision, restoreDecision } from "@/lib/policy/registry";
import type { NotificationPreferences, PolicyDecision } from "@/types/policy";

/**
 * Live preview of what the Policy Engine would decide right now, given the
 * preferences currently being edited. Re-evaluates against the Financial
 * Intelligence Feed's last-persisted items on every preference change —
 * this genuinely re-runs the same deterministic engine the dashboard uses
 * (and persists the result to the same registry), rather than faking a
 * read-only simulation.
 */
export default function NotificationPreview({ preferences }: { preferences: NotificationPreferences }) {
  const [refreshKey, setRefreshKey] = useState(0);

  const candidates = useMemo(() => {
    const feed = getAllFeedItems();
    if (feed.length === 0) return [];
    return evaluateNotificationPolicy({ feed, preferences, now: new Date() }).sort(
      (a, b) => b.priority - a.priority,
    );
    // refreshKey intentionally forces a re-evaluation after a manual override.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences, refreshKey]);

  function handleOverride(id: string, decision: PolicyDecision | null) {
    if (decision) overrideDecision(id, decision);
    else restoreDecision(id);
    setRefreshKey((k) => k + 1);
  }

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">
            No feed items to preview yet — visit the Dashboard first so the Intelligence Feed has
            something to evaluate.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {candidates.map((candidate) => (
        <PolicyDecisionCard key={candidate.id} candidate={candidate} onOverride={handleOverride} />
      ))}
    </div>
  );
}
