"use client";

import { useState } from "react";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/hooks/auth/use-current-user";
import { useDeleteAccount } from "@/hooks/auth/use-delete-account";

export default function PrivacySettings() {
  const { data: currentUser } = useCurrentUser();
  const deleteAccount = useDeleteAccount();
  const [confirmText, setConfirmText] = useState("");
  const [exporting, setExporting] = useState(false);

  const userEmail = currentUser?.user.email ?? "";
  const canDelete = confirmText.trim().toLowerCase() === userEmail.toLowerCase() && userEmail.length > 0;

  // A real file download, not an apiClient() JSON call — the response is a
  // Content-Disposition attachment the browser should save, not data a
  // React Query hook needs to hold in memory.
  async function handleExport() {
    setExporting(true);
    try {
      const response = await fetch("/api/me/export", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ledgerai-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            Your transactions, budgets, goals, and AI Coach conversation history are stored in
            LedgerAI&apos;s database (Neon Postgres) tied to your account — not just in this
            browser. Bank/email connection tokens are encrypted at rest. See our{" "}
            <a href="/legal/privacy" className="underline underline-offset-4">
              Privacy Policy
            </a>{" "}
            for the full breakdown of what we store and who it&apos;s shared with.
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              Export my data
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <TriangleAlert className="size-4" />
            Delete account
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Permanently deletes your account and every transaction, budget, goal, connection,
            and document tied to it. This cannot be undone from within the app. Type your
            account email ({userEmail || "…"}) to confirm.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Label htmlFor="delete-confirm" className="sr-only">
              Confirm your email
            </Label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={userEmail || "you@example.com"}
              className="sm:max-w-xs"
            />
            <Button
              variant="destructive"
              disabled={!canDelete || deleteAccount.isPending}
              onClick={() => deleteAccount.mutate(confirmText.trim())}
            >
              {deleteAccount.isPending ? <Loader2 className="animate-spin" /> : null}
              Delete my account
            </Button>
          </div>
          {deleteAccount.error && (
            <p className="text-destructive text-sm">{deleteAccount.error.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
