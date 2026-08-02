"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Database,
  FileClock,
  Link2,
  Lock,
  Palette,
  Plug,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import ImportHistoryList from "@/components/ImportHistoryList";
import MemoryManager from "@/components/MemoryManager";
import NotificationSettings from "@/components/NotificationSettings";
import SourceSettings from "@/components/SourceSettings";
import AISettings from "@/components/settings/AISettings";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import ConnectionsSettingsCard from "@/components/settings/ConnectionsSettingsCard";
import PrivacySettings from "@/components/settings/PrivacySettings";
import ProfileSettings from "@/components/settings/ProfileSettings";
import SecuritySettings from "@/components/settings/SecuritySettings";
import { Input } from "@/components/ui/input";
import type { AIProviderSummary } from "@/lib/ai/config";
import type { ConnectionRecord } from "@/lib/connections/types";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "connections", label: "Connections", icon: Link2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "privacy", label: "Privacy", icon: Lock },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "imports", label: "Imports", icon: FileClock },
  { id: "plugins", label: "Plugins", icon: Plug },
  { id: "advanced", label: "Advanced", icon: Database },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function isSectionId(value: string | null | undefined): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

/**
 * Settings' new two-pane shell — replaces the old flat 4-card grid.
 * Existing sections (Notifications, Imports/"Sources"->Plugins, Memory
 * ->Advanced) reuse their existing components unchanged; Profile,
 * Appearance, AI, Privacy, Security are net-new, minimal-viable panels this
 * round rather than half-built forms with nothing behind them.
 */
export default function SettingsShell({
  connections,
  aiSummary,
  initialSection,
}: {
  connections: ConnectionRecord[];
  aiSummary: AIProviderSummary;
  initialSection?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<SectionId>(isSectionId(initialSection) ? initialSection : "profile");

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => s.label.toLowerCase().includes(q));
  }, [query]);

  function selectSection(id: SectionId) {
    setActive(id);
    router.replace(`/settings?section=${id}`, { scroll: false });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <div className="flex flex-col gap-3">
        <Input placeholder="Search settings…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <nav className="flex flex-col gap-0.5">
          {filteredSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => selectSection(section.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                active === section.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <section.icon className="size-4 shrink-0" />
              {section.label}
            </button>
          ))}
          {filteredSections.length === 0 && (
            <p className="text-muted-foreground px-2.5 py-2 text-sm">No matching settings.</p>
          )}
        </nav>
      </div>

      <div className="min-w-0">
        {active === "profile" && <ProfileSettings />}
        {active === "appearance" && <AppearanceSettings />}
        {active === "connections" && <ConnectionsSettingsCard connections={connections} />}
        {active === "notifications" && (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              Decide which financial events deserve your attention, when, and
              through which channels. Nothing here is actually sent — these
              are recommendations for future delivery systems.
            </p>
            <NotificationSettings />
          </div>
        )}
        {active === "ai" && <AISettings summary={aiSummary} />}
        {active === "privacy" && <PrivacySettings />}
        {active === "security" && <SecuritySettings />}
        {active === "imports" && (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              Every CSV import you&apos;ve run, with counts and any skipped rows.
            </p>
            <ImportHistoryList />
          </div>
        )}
        {active === "plugins" && (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              Every transaction in LedgerAI comes from a source plugin.
              Manage which sources are active below.
            </p>
            <SourceSettings />
          </div>
        )}
        {active === "advanced" && (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              LedgerAI remembers categories you&apos;ve taught it. Matching
              notes skip the classifier next time.
            </p>
            <MemoryManager />
          </div>
        )}
      </div>
    </div>
  );
}
