import type { Locator } from "../../domain/content";
import { formatLink, parseLink, parseLocatorParam } from "../../domain/link";
import type {
  AnnotationRepository,
  ChapterRepository,
  ContentRepository,
  SpaceRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type { AnnotationId, ContentId, StudySetId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { queryTerms, type SearchDeps, searchEverything, snippetAround } from "../search/search";
import { annotationLinkLabel, linkLabel, placeLabel, shortTitle } from "./labels";

export interface LinkTargetDeps extends SearchDeps {
  chapters: ChapterRepository;
  annotations: AnnotationRepository;
  studySets: StudySetRepository;
  spaces?: SpaceRepository;
}

export type LinkTargetGroup =
  | "This source"
  | "Annotations"
  | "Summaries"
  | "Contents"
  | "Passages"
  | "Spaces";

/** One row of the `[[` / `@` picker in the notes editor. */
export interface LinkTarget {
  id: string;
  group: LinkTargetGroup;
  /** First line in the picker. */
  label: string;
  /** Second line: where it is. */
  detail: string | null;
  /** The `thoth:` URI the chip links to. */
  href: string;
  /** The chip text, like "Lecture 2 · p.3". */
  chipLabel: string;
}

const PER_GROUP = 6;

const matchesAll = (text: string, terms: string[]) => {
  const lower = text.toLowerCase();
  return terms.every((t) => lower.includes(t));
};

const cut = (text: string, n = 80) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};

/**
 * Targets for the notes link picker (doc 21): the current content's chapters, pages and
 * timestamps, its annotations and summaries, then other contents and matching passages
 * anywhere (the same hybrid search as Cmd+K). An empty query lists the current content.
 */
export async function searchLinkTargets(
  deps: LinkTargetDeps,
  input: { query: string; contentId?: ContentId | null },
): Promise<LinkTarget[]> {
  const query = input.query.trim().slice(0, 200);
  const terms = queryTerms(query);
  const out: LinkTarget[] = [];
  const here = input.contentId ? await deps.contents.get(input.contentId) : null;

  if (here) {
    const title = here.title;
    // A typed position ("p.3", "12:30", "§2") links straight to it.
    const typed = parseLocatorParam(query.replace(/^\[|\]$/g, ""));
    if (typed) {
      const place = placeLabel(typed) ?? query;
      out.push({
        id: `here-${place}`,
        group: "This source",
        label: `${shortTitle(title, 40)} at ${place}`,
        detail: null,
        href: formatLink({ kind: "content", contentId: here.id, locator: typed }),
        chipLabel: linkLabel(title, place),
      });
    }
    const chapters = (await deps.chapters.listByContent(here.id)).sort((a, b) => a.idx - b.idx);
    for (const c of chapters
      .filter((c) => matchesAll(`${c.title} ${c.summary}`, terms))
      .slice(0, PER_GROUP)) {
      const place = placeLabel(c.locator as Locator);
      out.push({
        id: `ch-${c.id}`,
        group: "This source",
        label: c.title,
        detail: place ? `Chapter · ${place}` : "Chapter",
        href: formatLink({ kind: "content", contentId: here.id, locator: c.locator }),
        chipLabel: linkLabel(title, place ?? c.title),
      });
    }
    const anns = await deps.annotations.listByContent(here.id);
    for (const a of anns
      .filter((a) => matchesAll(`${a.anchor.quote?.exact ?? ""} ${a.comment ?? ""}`, terms))
      .slice(0, PER_GROUP)) {
      const text = a.anchor.quote?.exact ?? a.comment ?? (a.kind === "ink" ? "Drawing" : "Shape");
      out.push({
        id: `a-${a.id}`,
        group: "Annotations",
        label: cut(text),
        detail: [placeLabel(a.anchor.locator), a.kind].filter(Boolean).join(" · "),
        href: formatLink({ kind: "annotation", annotationId: a.id }),
        chipLabel: annotationLinkLabel(title, a),
      });
    }
    const sets = await deps.studySets.listByContent(here.id, "summary");
    for (const s of sets
      .filter((s) => s.body && matchesAll(`${s.title} ${s.body}`, terms))
      .slice(0, PER_GROUP)) {
      out.push({
        id: `s-${s.id}`,
        group: "Summaries",
        label: s.title,
        detail: terms.length && s.body ? snippetAround(s.body, terms, 70) : "Summary",
        href: formatLink({ kind: "set", setId: s.id }),
        chipLabel: linkLabel(title, "Summary"),
      });
    }
  }

  if (terms.length > 0) {
    const hits = await searchEverything(deps, { query, limit: 16 });
    let contents = 0;
    let passages = 0;
    for (const h of hits) {
      if (h.kind === "title" && contents < PER_GROUP) {
        contents++;
        out.push({
          id: `c-${h.contentId}`,
          group: "Contents",
          label: h.title,
          detail: null,
          href: formatLink({ kind: "content", contentId: h.contentId as ContentId, locator: null }),
          chipLabel: shortTitle(h.title),
        });
      } else if (h.kind === "source" && passages < PER_GROUP) {
        const at = h.at ? parseLocatorParam(h.at.slice(1, -1)) : null;
        passages++;
        const place = placeLabel(at);
        out.push({
          id: `p-${h.id}`,
          group: "Passages",
          label: h.snippet ?? h.title,
          detail: [place, h.title].filter(Boolean).join(" · "),
          href: formatLink({ kind: "content", contentId: h.contentId as ContentId, locator: at }),
          chipLabel: linkLabel(h.title, place),
        });
      }
    }
    if (deps.spaces) {
      for (const s of (await deps.spaces.list())
        .filter((s) => matchesAll(s.name, terms))
        .slice(0, 3)) {
        out.push({
          id: `sp-${s.id}`,
          group: "Spaces",
          label: s.name,
          detail: "Space",
          href: formatLink({ kind: "space", spaceId: s.id }),
          chipLabel: shortTitle(s.name),
        });
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.href) ? false : (seen.add(t.href), true)));
}

/** Where a `thoth:` link lands, so a chip can open it (same content: jump; else: navigate). */
export type ResolvedLink =
  | {
      kind: "content";
      contentId: ContentId;
      title: string;
      locator: Locator | null;
      quote?: string;
    }
  | {
      kind: "annotation";
      contentId: ContentId;
      title: string;
      annotationId: AnnotationId;
      locator: Locator | null;
    }
  | { kind: "set"; contentId: ContentId; title: string; setId: StudySetId; quote?: string }
  | { kind: "space"; spaceId: string; name: string };

/** Resolves a link to its target. A deleted target is `not_found` (a broken chip). */
export async function resolveLink(
  deps: Pick<LinkTargetDeps, "contents" | "annotations" | "studySets" | "spaces">,
  href: string,
): Promise<Result<ResolvedLink>> {
  const parsed = parseLink(href);
  if (!parsed.ok) return parsed;
  const a = parsed.value;
  const gone = (what: string) => err(appError("not_found", `This ${what} no longer exists.`));
  switch (a.kind) {
    case "content": {
      const c = await deps.contents.get(a.contentId);
      if (!c) return gone("content");
      return ok({
        kind: "content",
        contentId: c.id,
        title: c.title,
        locator: a.locator,
        ...(a.quote ? { quote: a.quote.exact } : {}),
      });
    }
    case "annotation": {
      const ann = await deps.annotations.get(a.annotationId);
      if (!ann) return gone("highlight");
      const c = await deps.contents.get(ann.contentId);
      if (!c) return gone("content");
      return ok({
        kind: "annotation",
        contentId: c.id,
        title: c.title,
        annotationId: ann.id,
        locator: ann.anchor.locator,
      });
    }
    case "set": {
      const s = await deps.studySets.get(a.setId);
      if (!s?.contentId) return gone("summary");
      const c = await deps.contents.get(s.contentId);
      if (!c) return gone("content");
      return ok({
        kind: "set",
        contentId: c.id,
        title: c.title,
        setId: s.id,
        ...(a.quote ? { quote: a.quote.exact } : {}),
      });
    }
    case "space": {
      const sp = await deps.spaces?.get(a.spaceId);
      if (!sp) return gone("space");
      return ok({ kind: "space", spaceId: sp.id, name: sp.name });
    }
  }
}
