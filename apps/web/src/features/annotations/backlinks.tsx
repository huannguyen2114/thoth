"use client";

import type { BacklinkGroup, BacklinkSource } from "@thoth/core";
import { placeLabel } from "@thoth/core";
import { MenuButton, type MenuEntry } from "@/features/workspace/menu-button";
import { ownerName } from "./annotation-toolbar";
import { LinkIcon, NoteIcon } from "./icons";
import { useAnnotations } from "./store";
import { usePassage } from "./use-passage";

/** What a backlink group points at, in a few words: "p.3", "“Entropy never…”", "Summary". */
function targetLabel(g: BacklinkGroup, quoteOf: (id: string) => string | undefined): string {
  const t = g.target;
  if (t.kind === "annotation") {
    const q = quoteOf(t.annotationId);
    return q ? `“${q.length > 32 ? `${q.slice(0, 31)}…` : q}”` : "An annotation";
  }
  if (t.kind === "set") return "Summary";
  return placeLabel(t.locator) ?? "This source";
}

/**
 * "Referenced in N notes" for the source header (doc 21). Opens a menu of every note that links
 * into this content; picking one opens that note scrolled to the link. Hidden while none do.
 */
export function BacklinksButton({ contentId }: { contentId: string }) {
  const { backlinks, items } = useAnnotations(contentId);
  const { openBacklink } = usePassage(contentId);
  if (!backlinks || backlinks.total === 0) return null;

  const quoteOf = (id: string) => items.find((a) => a.id === id)?.anchor.quote?.exact;
  const entries: MenuEntry[] = [];
  for (const g of backlinks.groups) {
    for (const s of g.sources) {
      entries.push({
        kind: "item",
        id: `${g.key}-${s.fromKind}-${s.fromId}-${entries.length}`,
        label: `${ownerName(s)} · ${targetLabel(g, quoteOf)}`,
        icon: <NoteIcon />,
        onSelect: () => openBacklink(s),
      });
    }
  }
  const n = backlinks.noteCount;
  const label =
    n > 0 ? `Referenced in ${n} ${n === 1 ? "note" : "notes"}` : `${backlinks.total} links here`;
  return <MenuButton label={label} icon={<LinkIcon />} entries={entries} />;
}

/** Sources of the links that point at one annotation, for its popover and marker. */
export function useAnnotationBacklinks(contentId: string, annotationId: string | null) {
  const { backlinks } = useAnnotations(contentId);
  if (!annotationId || !backlinks) return [] as BacklinkSource[];
  return backlinks.groups.find((g) => g.key === `a:${annotationId}`)?.sources ?? [];
}

/**
 * A small "quoted in notes" marker beside a passage (transcript rows, annotation rows). Clicking
 * it opens the first note that quotes it, scrolled to the quote.
 */
export function QuotedMarker({
  contentId,
  sources,
}: {
  contentId: string;
  sources: BacklinkSource[];
}) {
  const { openBacklink } = usePassage(contentId);
  const first = sources[0];
  if (!first) return null;
  const label = `Quoted in ${sources.length} ${sources.length === 1 ? "note" : "notes"}`;
  return (
    <button
      type="button"
      className="inline-grid size-6 shrink-0 place-items-center rounded-md text-accent-text transition-colors duration-150 hover:bg-surface-300 pointer-coarse:size-11"
      aria-label={`${label}. Open the note`}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        openBacklink(first);
      }}
    >
      <NoteIcon />
    </button>
  );
}
