import EmailDashboard from "@/components/EmailDashboard";

export default function EmailPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Financial email classification, extraction, and attachment handling
        — mock provider data only, so a real Gmail API, Microsoft Graph,
        IMAP, or Exchange provider can replace it later without changing
        anything else here.
      </p>
      <EmailDashboard />
    </div>
  );
}
