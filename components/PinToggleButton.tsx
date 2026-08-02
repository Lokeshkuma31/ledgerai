import { Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PinToggleButton({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant={pinned ? "secondary" : "ghost"}
      size="xs"
      onClick={onToggle}
      aria-label={pinned ? "Unpin insight" : "Pin insight"}
    >
      {pinned ? <PinOff /> : <Pin />}
      {pinned ? "Pinned" : "Pin"}
    </Button>
  );
}
