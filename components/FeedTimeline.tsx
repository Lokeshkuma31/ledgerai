import FeedCard from "@/components/FeedCard";
import type { ExplanationContext } from "@/types/explanation";
import type { FeedItem, FeedTimelineGroup } from "@/types/feed";

export default function FeedTimeline({
  groups,
  now = new Date(),
  explanationContext,
  onDismiss,
  onPin,
  onMarkRead,
}: {
  groups: FeedTimelineGroup[];
  now?: Date;
  explanationContext?: ExplanationContext;
  onDismiss?: (item: FeedItem) => void;
  onPin?: (item: FeedItem) => void;
  onMarkRead?: (item: FeedItem) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {group.label}
          </h3>
          <div className="flex flex-col gap-2">
            {group.items.map((item) => (
              <FeedCard
                key={item.id}
                item={item}
                now={now}
                explanationContext={explanationContext}
                onDismiss={onDismiss}
                onPin={onPin}
                onMarkRead={onMarkRead}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
