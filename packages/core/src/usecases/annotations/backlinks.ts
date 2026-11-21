import type { Locator } from "../../domain/content";
import { formatLink, locatorParam, type TextQuote } from "../../domain/link";
import type {
  ContentRepository,
  LinkRecord,
  LinkRepository,
  LinkSourceKind,
  SpaceRepository,
} from "../../ports/repositories";
import type { AnnotationId, ContentId, SpaceId, StudySetId } from "../../shared/id";

export interface BacklinkDeps {
  links: LinkRepository;
  contents: ContentRepository;
  spaces?: SpaceRepository;
}

/** Where a backlink was written, so the UI can open it. */
export type BacklinkOwner =
  | { kind: "content"; contentId: ContentId; title: string }
  | { kind: "space"; spaceId: SpaceId; name: string }
  | { kind: "unknown" };

export interface BacklinkSource {
  fromKind: LinkSourceKind;
  fromId: string;
  /** The chip text as written in the note. */
  label: string;
  /** The `thoth:` URI as written, so the note can be scrolled to that chip. */
  href: string;
  owner: BacklinkOwner;
}

/** What the links in one group point at, inside this content. */
export type BacklinkTarget =
  | { kind: "content"; locator: Locator | null; quote?: TextQuote }
  | { kind: "annotation"; annotationId: AnnotationId }
  | { kind: "set"; setId: StudySetId; quote?: TextQuote };

export interface BacklinkGroup {
  /** `a:<annotationId>`, `s:<setId>`, `at:<p.3>` or `content` for the content as a whole. */
  key: string;
  target: BacklinkTarget;
  sources: BacklinkSource[];
}

export interface Backlinks {
  contentId: ContentId;
  /** Distinct notes documents that link here: "Referenced in N notes". */
  noteCount: number;
  /** Every link that lands here, grouped by annotation, set or position. */
  total: number;
  groups: BacklinkGroup[];
}

function groupOf(r: LinkRecord): { key: string; target: BacklinkTarget } | null {
  const a = r.anchor;
  switch (a.kind) {
    case "annotation":
      return {
        key: `a:${a.annotationId}`,
        target: { kind: "annotation", annotationId: a.annotationId },
      };
    case "set":
      return {
        key: `s:${a.setId}`,
        target: { kind: "set", setId: a.setId, ...(a.quote ? { quote: a.quote } : {}) },
      };
    case "content":
      return {
        key: a.locator ? `at:${locatorParam(a.locator)}` : "content",
        target: { kind: "content", locator: a.locator, ...(a.quote ? { quote: a.quote } : {}) },
      };
    case "space":
      return null;
  }
}

/**
 * Links that point into a content (ADR-0038): at it, at one of its annotations, or at one of
 * its sets, grouped by what they point at, each with the note or space that wrote it.
 * Links written in the content's own notes count too: a quote sent to notes is a backlink.
 */
export async function getBacklinks(deps: BacklinkDeps, contentId: ContentId): Promise<Backlinks> {
  const rows = await deps.links.backlinksTo(contentId);
  const contentTitles = new Map<string, string | null>();
  const spaceNames = new Map<string, string | null>();
  for (const r of rows) {
    if (r.fromContentId && !contentTitles.has(r.fromContentId)) {
      contentTitles.set(r.fromContentId, (await deps.contents.get(r.fromContentId))?.title ?? null);
    }
    if (r.fromSpaceId && !spaceNames.has(r.fromSpaceId)) {
      spaceNames.set(r.fromSpaceId, (await deps.spaces?.get(r.fromSpaceId))?.name ?? null);
    }
  }
  const ownerOf = (r: LinkRecord): BacklinkOwner => {
    const title = r.fromContentId ? contentTitles.get(r.fromContentId) : null;
    if (r.fromContentId && title != null) {
      return { kind: "content", contentId: r.fromContentId, title };
    }
    const name = r.fromSpaceId ? spaceNames.get(r.fromSpaceId) : null;
    if (r.fromSpaceId && name != null) return { kind: "space", spaceId: r.fromSpaceId, name };
    return { kind: "unknown" };
  };

  const groups = new Map<string, BacklinkGroup>();
  const notes = new Set<string>();
  let total = 0;
  for (const r of rows) {
    const g = groupOf(r);
    if (!g) continue;
    total++;
    if (r.fromKind === "note") notes.add(r.fromId);
    const group = groups.get(g.key) ?? { ...g, sources: [] };
    group.sources.push({
      fromKind: r.fromKind,
      fromId: r.fromId,
      label: r.label,
      href: formatLink(r.anchor),
      owner: ownerOf(r),
    });
    groups.set(g.key, group);
  }
  return { contentId, noteCount: notes.size, total, groups: [...groups.values()] };
}
