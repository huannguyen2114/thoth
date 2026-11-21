"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { type Command, useCommands } from "@/app/_components/commands";
import { moveContentAction } from "./actions";
import type { NavSpace } from "./space-nav-item";

/**
 * "Move to…" in the command palette (doc 22): on a content page, one command per space, plus
 * "Remove from its space". Mounted once in the sidebar; it registers nothing on other pages.
 */
export function MoveCommands({ spaces }: { spaces: NavSpace[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const contentId = /^\/content\/([^/]+)/.exec(pathname)?.[1] ?? null;

  const commands = useMemo<Command[]>(() => {
    if (!contentId) return [];
    const move = (spaceId: string | null) => async () => {
      const r = await moveContentAction(contentId, spaceId);
      if (r.ok) router.refresh();
      else window.alert(r.error);
    };
    return [
      ...spaces.map((s) => ({
        id: `move-to-${s.id}`,
        group: "Move to…",
        label: `Move to ${s.name}`,
        keywords: ["move", "space", "organise"],
        run: move(s.id),
      })),
      {
        id: "move-to-none",
        group: "Move to…",
        label: "Remove from its space",
        keywords: ["move", "space", "unfile"],
        run: move(null),
      },
    ];
  }, [contentId, spaces, router]);
  useCommands("Move to", commands);
  return null;
}
