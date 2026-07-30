import FeedPageContent from "@/components/feed/FeedPageContent";

export default function FeedPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Every alert, recommendation, and system insight across every
        engine — prioritized and deduplicated into one timeline.
      </p>
      <FeedPageContent />
    </div>
  );
}
