import { citationToken, paragraphOf } from "../../domain/citation";
import type { Chapter, Content, Segment } from "../../domain/content";
import type { SourceLink } from "../../domain/whiteboard";
import { sourceLinkSchema } from "../../domain/whiteboard";
import type {
  ChapterRepository,
  ContentRepository,
  SegmentRepository,
} from "../../ports/repositories";
import type { ContentId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { renderSourceText, resolveCitation } from "../quiz/source";

export interface SourceDeps {
  contents: ContentRepository;
  segments: SegmentRepository;
  chapters: ChapterRepository;
}

export interface LoadedSource {
  content: Content;
  segments: Segment[];
  chapters: Chapter[];
  /** `[p.3] text` lines for the prompt. */
  text: string;
}

export async function loadSource(
  deps: SourceDeps,
  contentId: ContentId,
): Promise<Result<LoadedSource>> {
  const content = await deps.contents.get(contentId);
  if (!content) return err(appError("not_found", "This content no longer exists."));
  if (content.status !== "ready") {
    return err(appError("validation", "Wait until this content has finished processing."));
  }
  const [segments, chapters] = await Promise.all([
    deps.segments.listByContent(contentId),
    deps.chapters.listByContent(contentId),
  ]);
  const sorted = [...segments].sort((a, b) => a.idx - b.idx);
  if (sorted.length === 0) return err(appError("not_found", "This content has no text yet."));
  return ok({ content, segments: sorted, chapters, text: renderSourceText(sorted) });
}

/**
 * A source link for a token the model wrote, or undefined when it does not point at a real
 * place in this content (the element is kept, without the link).
 */
export function linkFor(
  token: string | undefined,
  contentId: string,
  segments: readonly Segment[],
): SourceLink | undefined {
  if (!token) return undefined;
  const trimmed = token.trim();
  const link = sourceLinkSchema.safeParse({ contentId, token: trimmed });
  if (!link.success) return undefined;
  return resolveCitation(trimmed, segments) ? link.data : undefined;
}

/** A place in the source a person can link an element to ("Link to source…"). */
export interface SourcePlace {
  token: string;
  /** "Page 3", "03:21", "Paragraph 2". */
  label: string;
  /** The first words there, or the chapter title. */
  preview: string;
  chapter: boolean;
}

const anchorLabel = (token: string) => {
  const inner = token.slice(1, -1);
  if (inner.startsWith("p.")) return `Page ${inner.slice(2)}`;
  if (inner.startsWith("§")) return `Paragraph ${inner.slice(1)}`;
  return inner;
};

/** Every page, time or paragraph of a content, with its chapters first. */
export async function listSourceAnchors(
  deps: SourceDeps,
  contentId: ContentId,
): Promise<SourcePlace[]> {
  const [segments, chapters] = await Promise.all([
    deps.segments.listByContent(contentId),
    deps.chapters.listByContent(contentId),
  ]);
  const seen = new Set<string>();
  const out: SourcePlace[] = [];
  for (const c of [...chapters].sort((a, b) => a.idx - b.idx)) {
    const token = citationToken(c.locator);
    out.push({ token, label: anchorLabel(token), preview: c.title, chapter: true });
  }
  for (const s of [...segments].sort((a, b) => a.idx - b.idx)) {
    const token = citationToken(s.locator, paragraphOf(s));
    if (seen.has(token)) continue;
    seen.add(token);
    const preview = s.text.replace(/\s+/g, " ").trim().slice(0, 90);
    out.push({ token, label: anchorLabel(token), preview, chapter: false });
  }
  return out;
}
