"use client";

import type { AccentColor, SpaceIcon as SpaceIconName } from "@thoth/core";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveContentAction } from "./actions";
import { useContentDrop } from "./drag";
import { SpaceIcon } from "./space-icon";

export interface NavSpace {
  id: string;
  name: string;
  color?: AccentColor | null;
  icon?: SpaceIconName | null;
}

/**
 * A space in the sidebar: its icon in its colour, and a drop target, so a content dragged from
 * the library or a space's Contents tab moves here (doc 22).
 */
export function SpaceNavItem({ space }: { space: NavSpace }) {
  const pathname = usePathname();
  const router = useRouter();
  const href = `/spaces/${space.id}`;
  const current = pathname === href || pathname.startsWith(`${href}/`);
  const [note, setNote] = useState<string | null>(null);
  const [, start] = useTransition();

  const { dropProps } = useContentDrop((contentId) =>
    start(async () => {
      const r = await moveContentAction(contentId, space.id);
      setNote(r.ok ? "Moved here" : r.error);
      router.refresh();
      setTimeout(() => setNote(null), 2000);
    }),
  );

  return (
    <Link
      href={href}
      className="nav-item app-nav-item drop-target"
      aria-current={current ? "page" : undefined}
      title={space.name}
      {...dropProps}
    >
      <SpaceIcon icon={space.icon ?? null} color={space.color ?? null} />
      <span className="app-label truncate">{space.name}</span>
      {note && (
        <span role="status" className="app-label ml-auto shrink-0 type-caption text-ink-muted">
          {note}
        </span>
      )}
    </Link>
  );
}
