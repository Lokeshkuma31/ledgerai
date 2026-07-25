import { Card, CardContent } from "@/components/ui/card";

function SuggestionList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          {title}
        </span>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function CoachSuggestions({
  goodHabits,
  watchOutFor,
  suggestions,
}: {
  goodHabits: string[];
  watchOutFor: string[];
  suggestions: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <SuggestionList title="Good Habits" items={goodHabits} />
      <SuggestionList title="Things to Watch" items={watchOutFor} />
      <SuggestionList title="Suggestions" items={suggestions} />
    </div>
  );
}
