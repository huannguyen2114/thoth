import type { Locator } from "../../domain/content";
import type {
  ContentRepository,
  NoteRepository,
  SegmentRepository,
} from "../../ports/repositories";

export type SearchHitKind = "title" | "note" | "source";

export interface SearchHit {
  id: string;
  kind: SearchHitKind;
  contentId: string;
  /** Content title. */
  title: string;
  /** For notes and source hits: a snippet around the match. */
  snippet: string | null;
  /** Citation token of a source hit ("[p.3]"), for a readable place label; null otherwise. */
  at: string | null;
  /** App path; a source hit opens the content at its page, time or paragraph. */
  href: string;
  score: number;
}

export interface SearchDeps {
  contents: ContentRepository;
  notes: NoteRepository;
  segments: SegmentRepository;
}

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

/** Global search over content titles, notes and source text (FTS5). Empty query returns []. */
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

  for (const n of notes) {
    const title = titles.get(n.contentId);
    const lower = n.markdown.toLowerCase();
    if (title === undefined || !terms.every((t) => lower.includes(t))) continue;
    hits.push({
      id: `n-${n.contentId}`,
      kind: "note",
      contentId: n.contentId,
      title,
      snippet: snippetAround(n.markdown, terms),
      at: null,
      href: `/content/${n.contentId}`,
      score: terms.reduce((s, t) => s + lower.split(t).length - 1, 0),
    });
  }

  const sourceHits = await deps.segments.search(
    contents.map((c) => c.id),
    input.query,
    limit * 2,
  );
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
      score: -h.rank,
    });
  }

  return mergeHits(hits, limit);
}
