"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const THEMES = [
  { id: "dark", label: "Dark", icon: Moon },
  { id: "light", label: "Light", icon: Sun },
  { id: "system", label: "System", icon: Monitor },
] as const;

/** Promotes the Topbar's icon-cycle theme toggle into a proper settings
 * panel with explicit choices, rather than only a cycle-through-three
 * button. */
export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">Choose how LedgerAI looks.</p>
        <div className="flex flex-wrap gap-2">
          {THEMES.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={mounted && theme === id ? "default" : "outline"}
              onClick={() => setTheme(id)}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
