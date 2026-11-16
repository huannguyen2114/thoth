"use client";

import type { SearchHit } from "@thoth/core";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  type Command,
  type SearchProvider as Provider,
  useCommands,
  useSearchProvider,
} from "@/app/_components/commands";
import { ExportCommands } from "@/features/export/export-commands";

const groups = { title: "Content", note: "Notes", source: "In the source" } as const;

/**
 * Mounted once in the app shell. Adds global search (titles, notes, source text) to the Cmd+K
 * palette, the History command, and the export commands. The palette already debounces and
 * aborts; `signal` cancels the in-flight request when the query changes.
 */
export function SearchProvider() {
  const router = useRouter();

  const provider = useCallback<Provider>(async (query, signal) => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
    if (!res.ok) return [];
    const { hits } = (await res.json()) as { hits: SearchHit[] };
    return hits.map((h) => ({
      id: h.id,
      label: h.kind === "title" ? h.title : (h.snippet ?? h.title),
      group: groups[h.kind],
      href: h.href,
      ...(h.kind === "title"
        ? {}
        : { detail: [h.at?.replace(/[[\]]/g, ""), h.title].filter(Boolean).join(" · ") }),
    }));
  }, []);
  useSearchProvider(provider);

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "go-history",
        label: "Go to history",
        group: "Go to",
        run: () => router.push("/history"),
      },
    ],
    [router],
  );
  useCommands("history", commands);

  return <ExportCommands />;
}
