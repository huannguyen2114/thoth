import { citationToken, paragraphOf } from "../../domain/citation";
import type { Content, Segment } from "../../domain/content";
import type { ContentId } from "../../shared/id";
import { type RetrievalDeps, type RetrievalResult, retrieveSegments } from "../retrieval/retrieve";

/**
 * Source context for a chat turn. Small sources go in whole; large ones go in as the
 * top-k excerpts for the question, by hybrid FTS5 + vector retrieval (ADR-0029).
 * See docs/technical_design/07-content-page-and-chat.md and 16-embeddings-and-retrieval.md.
 */
export interface ChatContextOptions {
  /** Above this estimated size the context switches to search. Default 150k tokens. */
  maxFullTokens: number;
  /** How many search hits to include in search mode. */
  topK: number;
}

export const defaultChatContextOptions: ChatContextOptions = {
  maxFullTokens: 150_000,
  topK: 30,
};

export type ChatContextMode = "full" | "search";

export interface ChatContext {
  mode: ChatContextMode;
  /** The text placed in LlmRequest.context. */
  text: string;
  /** Segments included, in source order. */
  segments: Segment[];
  /** Total segments in the source, for the UI caption. */
  totalSegments: number;
  /** Search mode only: how the excerpts were found ("hybrid", or "fts" and why). */
  retrieval?: Pick<RetrievalResult, "mode" | "fallback" | "note">;
}

/** Rough token estimate: about 4 characters per token for English prose. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/**
 * The citation token for one segment. Paragraph tokens are 1-based (`[§1]` is the first
 * segment), and the viewer anchors paragraphs the same way.
 */
export function segmentToken(segment: Segment): string {
  return citationToken(segment.locator, paragraphOf(segment));
}

/** One line per segment: the token, then the text, so the model can copy the token exactly. */
export function formatSegments(segments: Segment[]): string {
  return segments.map((s) => `${segmentToken(s)} ${s.text.trim()}`).join("\n\n");
}

export function wrapSource(content: Pick<Content, "title" | "kind">, body: string, note?: string) {
  const lines = [`<source title="${escapeAttr(content.title)}" kind="${content.kind}">`];
  if (note) lines.push(`<!-- ${note} -->`);
  lines.push(body, "</source>");
  return lines.join("\n");
}

export async function buildChatContext(
  deps: RetrievalDeps,
  content: Pick<Content, "id" | "title" | "kind">,
  question: string,
  options: ChatContextOptions = defaultChatContextOptions,
): Promise<ChatContext> {
  const all = await deps.segments.listByContent(content.id);
  const full = formatSegments(all);
  if (estimateTokens(full) <= options.maxFullTokens) {
    return {
      mode: "full",
      text: wrapSource(content, full),
      segments: all,
      totalSegments: all.length,
    };
  }

  const { picked, retrieval } = await pickRelevant(deps, content.id, all, question, options.topK);
  const note = `Only ${picked.length} of ${all.length} passages are included: the ones that best match the question.`;
  return {
    mode: "search",
    text: wrapSource(content, formatSegments(picked), note),
    segments: picked,
    totalSegments: all.length,
    retrieval,
  };
}

/**
 * Top-k hybrid hits for the question (keywords alone when there are no vectors yet). When
 * nothing matches (for example "summarise this" with keywords only) it falls back to passages
 * spread evenly across the source.
 */
async function pickRelevant(
  deps: RetrievalDeps,
  contentId: ContentId,
  all: Segment[],
  question: string,
  topK: number,
): Promise<{ picked: Segment[]; retrieval: NonNullable<ChatContext["retrieval"]> }> {
  const r = await retrieveSegments(deps, {
    contentIds: [contentId],
    query: question,
    k: topK,
    known: all,
  });
  const chosen = r.hits.length > 0 ? r.hits.map((h) => h.segment) : spreadEvenly(all, topK);
  return {
    picked: [...chosen].sort((a, b) => a.idx - b.idx),
    retrieval: { mode: r.mode, fallback: r.fallback, note: r.note },
  };
}

export function spreadEvenly<T>(items: T[], k: number): T[] {
  if (items.length <= k) return items;
  const step = items.length / k;
  return Array.from({ length: k }, (_, i) => items[Math.floor(i * step)]).filter(
    (x): x is T => x !== undefined,
  );
}

const escapeAttr = (s: string) => s.replaceAll('"', "&quot;").replaceAll("<", "&lt;");
