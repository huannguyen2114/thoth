import { cx } from "@thoth/ui";
import type { ReactNode } from "react";

/**
 * A page's title (ADR-0047, ADR-0048): the same tinted icon tile the sidebar shows for the page,
 * a large serif title and a soft glow behind, so each page opens with its own colour.
 */
export function PageHeader({
  icon,
  tone,
  title,
  sub,
  action,
}: {
  icon: ReactNode;
  /** A tone utility, matching the page's sidebar item. */
  tone: string;
  title: string;
  sub: string;
  action?: ReactNode;
}) {
  return (
    <header className="relative flex flex-wrap items-end justify-between gap-4">
      <div aria-hidden="true" className="glow glow--peach -top-16 -left-16 size-64" />
      <div className="relative flex items-center gap-3 md:gap-4">
        <span className={cx("page-header__icon", tone)} aria-hidden="true">
          {icon}
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="type-display-lg text-ink md:type-hero-sm">{title}</h1>
          <p className="text-ink-muted">{sub}</p>
        </div>
      </div>
      {action && <div className="relative">{action}</div>}
    </header>
  );
}
