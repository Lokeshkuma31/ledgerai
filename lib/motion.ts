/**
 * Shared motion tokens — mirrors the --motion-* CSS custom properties in
 * app/globals.css so JS-driven animation (AnimatedCounter, StatusDot) and
 * CSS transitions read from the same named scale instead of each
 * component picking its own duration/easing.
 */

export const MOTION_DURATION = {
  fast: 120,
  base: 200,
  moderate: 350,
  slow: 500,
} as const;

export type MotionDurationToken = keyof typeof MOTION_DURATION;

export const MOTION_EASE = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  decelerate: "cubic-bezier(0, 0, 0, 1)",
  accelerate: "cubic-bezier(0.3, 0, 1, 1)",
} as const;

export type MotionEaseToken = keyof typeof MOTION_EASE;
