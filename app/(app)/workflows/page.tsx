import WorkflowsOverview from "@/components/WorkflowsOverview";

export default function WorkflowsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Reusable, traceable financial workflows that coordinate every other
        engine — registered workflows, their step sequences, and full
        execution history.
      </p>
      <WorkflowsOverview />
    </div>
  );
}
