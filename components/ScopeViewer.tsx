import { Badge } from "@/components/ui/badge";

const SCOPE_LABELS: Record<string, string> = {
  openid: "Identity",
  email: "Email address",
  profile: "Basic profile",
  offline_access: "Stay connected (refresh access)",
  "https://www.googleapis.com/auth/gmail.readonly": "Read Gmail messages (future milestone)",
  "Mail.Read": "Read Outlook mail (future milestone)",
};

function labelFor(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

export default function ScopeViewer({ scopes }: { scopes: string[] }) {
  if (scopes.length === 0) {
    return <p className="text-muted-foreground text-xs">No scopes granted.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {scopes.map((scope) => (
        <Badge key={scope} variant="secondary" title={scope}>
          {labelFor(scope)}
        </Badge>
      ))}
    </div>
  );
}
