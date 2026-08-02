import {
  Banknote,
  Bus,
  Ellipsis,
  Film,
  GraduationCap,
  HeartPulse,
  Plane,
  Receipt,
  ShoppingBag,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CATEGORIES, type Category } from "@/types/transaction";

/** One icon per transaction category — closes the "no category iconography
 * anywhere" gap (categories previously rendered as plain text badges only).
 * Keyed off the same Category union everything else in the app uses, so a
 * new category can never silently render without an icon (see the
 * exhaustiveness test in lib/categoryIcons.test.ts). */
export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  Food: UtensilsCrossed,
  Transport: Bus,
  Shopping: ShoppingBag,
  Bills: Receipt,
  Entertainment: Film,
  Health: HeartPulse,
  Education: GraduationCap,
  Travel: Plane,
  Salary: Banknote,
  Transfer: Wallet,
  Other: Ellipsis,
};

export function getCategoryIcon(category: string | undefined): LucideIcon {
  if (category && category in CATEGORY_ICONS) {
    return CATEGORY_ICONS[category as Category];
  }
  return CATEGORY_ICONS.Other;
}

/** Exported for the exhaustiveness test — avoids re-importing CATEGORIES
 * just to assert against the same list this module already depends on. */
export const ALL_CATEGORIES = CATEGORIES;
