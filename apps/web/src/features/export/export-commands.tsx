"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { type Command, useCommands } from "@/app/_components/commands";
import { downloadFile } from "./download";

/**
 * Palette commands that export what the owner is looking at: they work from the current
 * `/content/{id}` URL, so no other feature's UI has to change. Failures show in a small
 * status callout in the corner (role="status"), never a blocking dialog.
 */
export function ExportCommands() {
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const contentId = /^\/content\/([^/]+)/.exec(pathname)?.[1] ?? null;

  const commands = useMemo<Command[]>(() => {
    if (!contentId) return [];
    const run = async (path: string) => {
      setError(null);
      const r = await downloadFile(`/api/export/content/${contentId}/${path}`);
      if (!r.ok) setError(r.error);
    };
    return [
      {
        id: "export-markdown",
        label: "Export notes and summaries as Markdown",
        group: "Export",
        keywords: ["download", "md", "notes", "summary"],
        run: () => void run("markdown"),
      },
      {
        id: "export-anki",
        label: "Export flashcards as Anki CSV",
        group: "Export",
        keywords: ["download", "csv", "cards", "anki"],
        run: () => void run("flashcards"),
      },
    ];
  }, [contentId]);
  useCommands("export", commands);

  if (!error) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-border-control bg-danger-tint p-3 text-ink shadow-lg"
    >
      <p className="type-caption flex-1">{error}</p>
      <button
        type="button"
        onClick={() => setError(null)}
        className="type-label min-h-8 px-2 text-ink-muted"
      >
        Dismiss
      </button>
    </div>
  );
}
