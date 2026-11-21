import type { Content, Segment } from "../../domain/content";
import { type RetrievalDeps, type RetrievalResult, retrieveSegments } from "../retrieval/retrieve";
import { estimateTokens, formatSegments, spreadEvenly } from "./context";
import type { SpaceSource } from "./space-chat-citations";

/**
 * Source context for a space chat turn (doc 22). A small space goes in whole. A larger one goes
 * in as hybrid-retrieval hits (ADR-0029) across all its ready contents, at most `perContentK`
 * passages from one content and `totalK` in all, so one long book cannot crowd out the rest.
 */
export interface SpaceChatContextOptions {
  /** Above this estimated size (all contents together) the context switches to search. */
  maxFullTokens: number;
  /** Most passages taken from one content in search mode. */
  perContentK: number;
  /** Most passages in all in search mode. */
  totalK: number;
}

export const defaultSpaceChatContextOptions: SpaceChatContextOptions = {
  maxFullTokens: 60_000,
  perContentK: 8,
  totalK: 40,
};

export interface SpaceChatContext {
  mode: "full" | "search";
  /** The text placed in LlmRequest.context: one `<source id="Sn">` block per source. */
  text: string;
  /** Only the contents that contributed passages, labelled S1..Sn in prompt order. */
  sources: SpaceSource[];
  /** Passages included, across all sources. */
  included: number;
  /** Passages in the space's ready contents. */
  total: number;
  retrieval?: Pick<RetrievalResult, "mode" | "fallback" | "note">;
}

type ContentLike = Pick<Content, "id" | "title" | "kind">;

const escapeAttr = (s: string) => s.replaceAll('"', "&quot;").replaceAll("<", "&lt;");

export async function buildSpaceChatContext(
  deps: RetrievalDeps,
  contents: readonly ContentLike[],
  question: string,
  options: SpaceChatContextOptions = defaultSpaceChatContextOptions,
): Promise<SpaceChatContext> {
  const all = await Promise.all(
    contents.map(async (c) => ({ content: c, segments: await deps.segments.listByContent(c.id) })),
  );
  const total = all.reduce((n, x) => n + x.segments.length, 0);
  const fullTokens = all.reduce((n, x) => n + estimateTokens(formatSegments(x.segments)), 0);

  if (fullTokens <= options.maxFullTokens) {
    return render("full", all, total);
  }

  const known = all.flatMap((x) => x.segments);
  const r = await retrieveSegments(deps, {
    contentIds: contents.map((c) => c.id),
    query: question,
    // A deeper pool than we keep, so the per-content cap still leaves room for every content.
    k: options.totalK * 3,
    known,
  });
  const picked = new Map<string, Segment[]>();
  let kept = 0;
  for (const h of r.hits) {
    if (kept >= options.totalK) break;
    const list = picked.get(h.segment.contentId) ?? [];
    if (list.length >= options.perContentK) continue;
    list.push(h.segment);
    picked.set(h.segment.contentId, list);
    kept += 1;
  }
  if (kept === 0) {
    // Nothing matched (for example "summarise" with keywords only): an even spread of each.
    const each = Math.max(
      1,
      Math.min(options.perContentK, Math.floor(options.totalK / all.length)),
    );
    for (const x of all) picked.set(x.content.id, spreadEvenly(x.segments, each));
  }
  const chosen = all.map((x) => ({
    content: x.content,
    segments: [...(picked.get(x.content.id) ?? [])].sort((a, b) => a.idx - b.idx),
  }));
  return {
    ...render("search", chosen, total),
    retrieval: { mode: r.mode, fallback: r.fallback, note: r.note },
  };
}

function render(
  mode: SpaceChatContext["mode"],
  parts: { content: ContentLike; segments: Segment[] }[],
  total: number,
): SpaceChatContext {
  const sources: SpaceSource[] = [];
  const blocks: string[] = [];
  let included = 0;
  for (const p of parts) {
    if (p.segments.length === 0) continue;
    const label = `S${sources.length + 1}`;
    sources.push({ label, contentId: p.content.id, title: p.content.title, kind: p.content.kind });
    included += p.segments.length;
    blocks.push(
      [
        `<source id="${label}" title="${escapeAttr(p.content.title)}" kind="${p.content.kind}">`,
        formatSegments(p.segments),
        "</source>",
      ].join("\n"),
    );
  }
  return { mode, text: blocks.join("\n\n"), sources, included, total };
}
