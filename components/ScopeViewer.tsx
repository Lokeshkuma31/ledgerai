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
        <span key={scope} className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs" title={scope}>
          {labelFor(scope)}
        </span>
      ))}
    </div>
  );
}
