import type { SelectHTMLAttributes } from "react";
import { cx } from "../cx";

/**
 * Hearth Select with its chevron. Wrap in a `field` label for a visible label.
 * See design/hearth/components/Select/README.md.
 */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select-wrap">
      <select className={cx("select", className)} {...rest}>
        {children}
      </select>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </span>
  );
}
