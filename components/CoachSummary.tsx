import { Card, CardContent } from "@/components/ui/card";

export default function CoachSummary({ summary }: { summary: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-sm">{summary}</p>
      </CardContent>
    </Card>
  );
}
