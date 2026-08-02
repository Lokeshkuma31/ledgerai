import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SecuritySettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Security</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          OAuth tokens for connected accounts (Gmail, Outlook, Yahoo) are
          encrypted at rest with AES-256-GCM and held only server-side —
          this app, and this page, never has access to the raw token value.
        </p>
        <p className="text-muted-foreground">
          There&apos;s no separate account password, since LedgerAI has no
          user accounts — access is scoped to whoever can open this device.
        </p>
      </CardContent>
    </Card>
  );
}
