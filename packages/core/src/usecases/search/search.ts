import type { Locator } from "../../domain/content";
import type {
  ContentRepository,
  NoteRepository,
  SegmentRepository,
  SpaceRepository,
} from "../../ports/repositories";
import { type RetrievalDeps, retrieveSegments } from "../retrieval/retrieve";

export type SearchHitKind = "title" | "note" | "source";

export interface SearchHit {
  id: string;
  kind: SearchHitKind;
  /** The content the hit belongs to; empty for a space's notes. */
  contentId: string;
  /** Set for a space's notes (Phase 10, doc 22). */
  spaceId?: string;
  /** Content title, or the space name for a space's notes. */
  title: string;
  /** For notes and source hits: a snippet around the match. */
  snippet: string | null;
  /** Citation token of a source hit ("[p.3]"), for a readable place label; null otherwise. */
  at: string | null;
  /** App path; a source hit opens the content at its page, time or paragraph. */
  href: string;
  score: number;
}

/** `vectors` and `embeddings` are optional: without them source hits are keyword matches only. */
export interface SearchDeps extends RetrievalDeps {
  contents: ContentRepository;
  notes: NoteRepository;
  segments: SegmentRepository;
  /** Names space notes in results (Phase 10, doc 22). Without it, space notes are skipped. */
  spaces?: SpaceRepository;
}

/**
 * Cosine distance above which a vector hit is not shown in Cmd+K. Vector search always
 * returns something; without a cut-off a typo would list random passages. Measured on
 * multilingual-e5-small, see docs/technical_design/16-embeddings-and-retrieval.md.
 */
export const SEMANTIC_MAX_DISTANCE = 0.205;

const CONTENT_SCAN_LIMIT = 500;

/** Lowercased words of 2+ letters or digits. */
export function queryTerms(query: string): string[] {
  return (
    query
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((t) => t.length > 1) ?? []
  );
}

/** "[p.3]", "[01:02]" or "[§4]" for the content page's `?at=` (the same tokens as citations). */
export function locatorToken(l: Locator): string {
  if (l.type === "page") return `[p.${l.page}]`;
  if (l.type === "time") {
    const s = Math.floor(l.startSec);
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return h > 0 ? `[${h}:${mm}:${ss}]` : `[${mm}:${ss}]`;
  }
  return l.paragraph ? `[§${l.paragraph}]` : "";
}

/** A one-line excerpt around the first matching term, trimmed to about `width` characters. */
export function snippetAround(text: string, terms: string[], width = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const at =
    terms
      .map((t) => lower.indexOf(t))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/** Score for a title: all terms must appear; earlier and whole-word matches rank higher. */
export function titleScore(title: string, terms: string[]): number {
  const lower = title.toLowerCase();
  if (terms.length === 0 || !terms.every((t) => lower.includes(t))) return 0;
  const words: string[] = lower.match(/[\p{L}\p{N}]+/gu) ?? [];
  let score = 100;
  if (lower.startsWith(terms[0] ?? "")) score += 20;
  for (const t of terms) if (words.includes(t)) score += 10;
  return score;
}

/**
 * Merges the three sources into one ranked list: titles first (what the owner usually means),
 * then notes, then source passages ordered by BM25. Scores are only comparable inside one
 * kind, so kind decides the order and the score the order within it.
 */
export function mergeHits(hits: SearchHit[], limit: number): SearchHit[] {
  const order: Record<SearchHitKind, number> = { title: 0, note: 1, source: 2 };
  const seen = new Set<string>();
  return [...hits]
    .sort((a, b) => order[a.kind] - order[b.kind] || b.score - a.score)
    .filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)))
    .slice(0, limit);
}

/**
 * Global search over content titles, notes and source text (FTS5, plus vectors when the index
 * is built). Empty query returns [].
 */
export async function searchEverything(
  deps: SearchDeps,
  input: { query: string; limit?: number },
): Promise<SearchHit[]> {
  const limit = input.limit ?? 12;
  const terms = queryTerms(input.query);
  if (terms.length === 0) return [];

  const [contents, notes] = await Promise.all([
    deps.contents.listRecent(CONTENT_SCAN_LIMIT),
    deps.notes.list(),
  ]);
  const titles = new Map(contents.map((c) => [c.id as string, c.title]));
  const hits: SearchHit[] = [];

  for (const c of contents) {
    const score = titleScore(c.title, terms);
    if (score > 0) {
      hits.push({
        id: `t-${c.id}`,
        kind: "title",
        contentId: c.id,
        title: c.title,
        snippet: null,
        at: null,
        href: `/content/${c.id}`,
        score,
      });
    }
  }

  const spaceNames = deps.spaces
    ? new Map((await deps.spaces.list()).map((s) => [s.id as string, s.name]))
    : new Map<string, string>();
  for (const n of notes) {
    // A content's notes open the content; a space's notes open its Notes tab (doc 22).
    const ownerId = n.contentId ?? n.spaceId;
    const title = n.contentId
      ? titles.get(n.contentId)
      : n.spaceId
        ? spaceNames.get(n.spaceId)
        : undefined;
    const lower = n.markdown.toLowerCase();
    if (!ownerId || title === undefined || !terms.every((t) => lower.includes(t))) continue;
    hits.push({
      id: `n-${ownerId}`,
      kind: "note",
      contentId: n.contentId ?? "",
      ...(n.spaceId ? { spaceId: n.spaceId } : {}),
      title,
      snippet: snippetAround(n.markdown, terms),
      at: null,
      href: n.contentId ? `/content/${n.contentId}` : `/spaces/${n.spaceId}?tab=notes`,
      score: terms.reduce((s, t) => s + lower.split(t).length - 1, 0),
    });
  }

  // Hybrid (ADR-0029): keyword hits plus close paraphrases, fused by rank.
  const { hits: sourceHits } = await retrieveSegments(deps, {
    contentIds: contents.map((c) => c.id),
    query: input.query,
    k: limit * 2,
    maxDistance: SEMANTIC_MAX_DISTANCE,
    embedTimeoutMs: 3_000,
  });
  for (const h of sourceHits) {
    const title = titles.get(h.segment.contentId);
    if (title === undefined) continue;
    const token = locatorToken(h.segment.locator);
    hits.push({
      id: `s-${h.segment.id}`,
      kind: "source",
      contentId: h.segment.contentId,
      title,
      snippet: snippetAround(h.segment.text, terms),
      at: token || null,
      href: `/content/${h.segment.contentId}${token ? `?at=${encodeURIComponent(token)}` : ""}`,
      score: h.score,
    });
  }

  return mergeHits(hits, limit);
}
