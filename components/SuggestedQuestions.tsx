import { Button } from "@/components/ui/button";

export default function SuggestedQuestions({
  questions,
  onSelect,
  disabled,
}: {
  questions: string[];
  onSelect: (question: string) => void;
  disabled: boolean;
}) {
  if (questions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {questions.map((question) => (
        <Button
          key={question}
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onSelect(question)}
        >
          {question}
        </Button>
      ))}
    </div>
  );
}
