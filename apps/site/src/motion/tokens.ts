import type { Transition } from "motion/react";

/**
 * The landing page's feel, in one place (Phase 12): spring physics like iOS and Material You.
 * Snappy for presses and toggles, smooth for cards and panels, gentle for large reveals,
 * bouncy for playful moments.
 */
export const spring = {
  snappy: { type: "spring", stiffness: 500, damping: 32, mass: 0.8 },
  smooth: { type: "spring", stiffness: 260, damping: 30 },
  gentle: { type: "spring", stiffness: 120, damping: 20 },
  bouncy: { type: "spring", stiffness: 380, damping: 18 },
} satisfies Record<string, Transition>;
