import type { ReactNode } from "react";

/** Hearth Callout (danger and info). design/hearth/components/Callout/README.md */
export function Callout({
  variant,
  title,
  children,
  className = "",
}: {
  variant: "danger" | "info";
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`callout callout--${variant} ${className}`}
      role={variant === "danger" ? "alert" : "note"}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
        style={{ flex: "none", marginTop: 2 }}
      >
        <circle cx="8" cy="8" r="6.2" />
        {variant === "danger" ? (
          <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />
        ) : (
          <path d="M8 7.2V11.4M8 4.9v.1" />
        )}
      </svg>
      <div>
        <p className="callout__title">{title}</p>
        <p className="callout__text">{children}</p>
      </div>
    </div>
  );
}
