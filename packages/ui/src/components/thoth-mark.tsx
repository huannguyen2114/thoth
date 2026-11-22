import { useId } from "react";

/**
 * Thoth's brand (design/brand/README.md): an ibis head under the moon.
 * Keep these paths in step with design/brand/*.svg.
 */
const IBIS =
  "M46 122 C40 96 46 70 62 56 C72 46 88 44 96 52 C116 54 128 72 130 98 C122 82 110 72 96 68 C90 76 80 78 72 78 C62 88 60 104 64 122 Z";

/** The mark alone, in `currentColor`: the moon is a lighter tone and the eye is cut out. */
export function ThothMark({ size = 24, className }: { size?: number; className?: string }) {
  const mask = useId();
  return (
    <svg
      viewBox="34 16 104 108"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <mask id={mask}>
        <rect width="140" height="140" fill="#fff" />
        <circle cx="84" cy="58" r="3.5" fill="#000" />
      </mask>
      <circle cx="98" cy="30" r="10" fill="currentColor" opacity="0.45" />
      <path d={IBIS} fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  );
}

/** The app icon tile in its brand colours (Hearth accent on surface-100). */
export function ThothIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 140 140"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="140" height="140" rx="32" fill="var(--color-surface-100)" />
      <circle cx="98" cy="30" r="10" fill="var(--color-accent-muted)" />
      <path d={IBIS} fill="var(--color-accent)" />
      <circle cx="84" cy="58" r="3.5" fill="var(--color-surface-100)" />
    </svg>
  );
}
