import { describe, expect, it } from "vitest";
import { ALL_CATEGORIES, CATEGORY_ICONS, getCategoryIcon } from "@/lib/categoryIcons";

describe("CATEGORY_ICONS", () => {
  it("maps every known category to an icon", () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_ICONS[category]).toBeDefined();
    }
  });
});

describe("getCategoryIcon", () => {
  it("returns the matching icon for a known category", () => {
    expect(getCategoryIcon("Food")).toBe(CATEGORY_ICONS.Food);
  });

  it("falls back to the Other icon for an unrecognized or missing category", () => {
    expect(getCategoryIcon("NotACategory")).toBe(CATEGORY_ICONS.Other);
    expect(getCategoryIcon(undefined)).toBe(CATEGORY_ICONS.Other);
  });
});
