import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacySettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Privacy</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          Transactions, budgets, merchants, and conversation history are
          stored only in this browser&apos;s local storage — nothing is sent
          to a server except the AI Coach&apos;s own model calls (see AI
          settings) and OAuth connections you explicitly set up.
        </p>
        <p className="text-muted-foreground">
          Clearing your browser&apos;s site data for this app removes
          everything and cannot be undone from within the app.
        </p>
      </CardContent>
    </Card>
  );
}
