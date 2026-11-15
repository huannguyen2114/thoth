import type { ButtonHTMLAttributes } from "react";
import { cx } from "../cx";

/**
 * Hearth Button. One `primary` per view. See design/hearth/components/Button/README.md.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("btn", `btn--${variant}`, size !== "md" && `btn--${size}`, className)}
      {...rest}
    />
  );
}
