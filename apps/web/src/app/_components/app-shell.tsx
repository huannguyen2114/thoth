import { listSpaces } from "@thoth/core";
import Link from "next/link";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { getContainer } from "@/server/container";
import { NavLink } from "./nav-link";

/** The owner's spaces, newest first (data, so it renders inside Suspense). */
async function SpacesNav() {
  await connection();
  const spaces = await listSpaces(await getContainer());
  if (spaces.length === 0) {
    return <p className="px-3 type-caption text-ink-muted">No spaces yet</p>;
  }
  return spaces.map((s) => (
    <NavLink key={s.id} href={`/spaces/${s.id}`}>
      <FolderIcon />
      <span className="truncate" title={s.name}>
        {s.name}
      </span>
    </NavLink>
  ));
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 13V8M8 13V3M13 13V6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Left sidebar + main column. Mirrors the YouLearn layout using Hearth's sidebar pattern. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border-subtle bg-surface-300 p-3 md:flex">
        <Link href="/" className="px-3 py-4 type-heading-2 text-ink no-underline">
          Thoth
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5">
          <NavLink href="/">
            <PlusIcon /> Add content
          </NavLink>
          <NavLink href="/review">
            <CardsIcon /> Review
          </NavLink>
          <NavLink href="/progress">
            <ChartIcon /> Progress
          </NavLink>
          <p className="sidebar__group type-overline text-ink-muted">Spaces</p>
          <Suspense fallback={null}>
            <SpacesNav />
          </Suspense>
          <div className="flex-1" />
          <NavLink href="/settings">
            <GearIcon /> Settings
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1 px-4 py-10 md:px-8">{children}</main>
    </div>
  );
}

function CardsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="9" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 2.5h7a1.5 1.5 0 0 1 1.5 1.5v7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
