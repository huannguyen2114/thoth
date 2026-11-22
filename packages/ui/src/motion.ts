/**
 * Thoth's motion feel (ADR-0046, ADR-0047): spring physics like iOS and Material You, shared by
 * the app and the landing site. Plain objects, so @thoth/ui needs no animation library; pass them
 * as a `transition` to `motion` components.
 *
 * snappy: presses, toggles, pills. smooth: cards and panels. gentle: large reveals.
 * bouncy: playful moments (stickers, a card flying off, a fan of cards).
 */
export const spring = {
  snappy: { type: "spring", stiffness: 500, damping: 32, mass: 0.8 },
  smooth: { type: "spring", stiffness: 260, damping: 30 },
  gentle: { type: "spring", stiffness: 120, damping: 20 },
  bouncy: { type: "spring", stiffness: 380, damping: 18 },
} as const;
