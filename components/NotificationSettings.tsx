"use client";

import { useState } from "react";
import NotificationPreferences from "@/components/NotificationPreferences";
import NotificationPreview from "@/components/NotificationPreview";
import PolicyStatistics from "@/components/PolicyStatistics";
import { DEFAULT_PREFERENCES } from "@/lib/policy/preferences";
import { getAllCandidates } from "@/lib/policy/registry";
import { computePolicyStatistics } from "@/lib/policy/statistics";
import type { NotificationPreferences as Preferences } from "@/types/policy";

/**
 * Backs app/settings/notifications/page.tsx, the same way MemoryManager
 * backs the Memory settings page — one component composing the smaller
 * preference/preview/statistics pieces.
 */
export default function NotificationSettings() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  const statistics = computePolicyStatistics(getAllCandidates());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Preferences</h2>
        <NotificationPreferences
          onChange={(next) => setPreferences(next)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Statistics</h2>
        <PolicyStatistics statistics={statistics} />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Preview</h2>
        <NotificationPreview preferences={preferences} />
      </div>
    </div>
  );
}
