import Link from "next/link";
import type { ReactNode } from "react";

/** Left sidebar + main column. Mirrors the YouLearn layout using Hearth's sidebar pattern. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border-subtle bg-surface-300 p-3 md:flex">
        <Link href="/" className="px-3 py-4 type-heading-2 text-ink no-underline">
          Thoth
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          <Link href="/" className="nav-item" aria-current="page">
            <PlusIcon /> Add content
          </Link>
        </nav>
        <p className="sidebar__group type-overline text-ink-muted">Spaces</p>
      </aside>
      <main className="flex-1 px-4 py-10 md:px-8">{children}</main>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
