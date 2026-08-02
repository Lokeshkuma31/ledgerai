import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * LedgerAI has no user accounts (see the sidebar footer: "Local workspace
 * / Data stored on this device") — there's no name/email/avatar to edit.
 * This panel states that plainly rather than faking editable fields with
 * nothing to persist them to.
 */
export default function ProfileSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          LedgerAI runs as a single local workspace with no user accounts —
          all data stays in this browser&apos;s storage. There&apos;s no
          profile to configure yet.
        </p>
      </CardContent>
    </Card>
  );
}
