"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import FeedCard from "@/components/FeedCard";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useNotificationCenter } from "@/lib/feed/useNotificationCenter";

/**
 * Replaces the Topbar's previously-decorative bell button. The Notification
 * Policy Engine (lib/policy/*) has always computed which feed items deserve
 * immediate attention — this is the first UI that actually surfaces that
 * decision to the user, via useNotificationCenter/selectNotifiableFeedItems,
 * rather than the engine's output going unused.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { items, unreadCount, dismiss, togglePin, markRead, isLoading } = useNotificationCenter();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        title="Notifications"
        onClick={() => setOpen(true)}
        className="relative"
      >
        <Bell />
        {unreadCount > 0 && (
          <span className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>Items flagged for your immediate attention.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing needs your attention right now.</p>
            ) : (
              items.map((item) => (
                <FeedCard key={item.id} item={item} onDismiss={dismiss} onPin={togglePin} onMarkRead={markRead} />
              ))
            )}
          </div>
          <SheetFooter>
            <Link
              href="/feed"
              onClick={() => setOpen(false)}
              className="text-primary text-sm hover:underline"
            >
              View all in Feed →
            </Link>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
