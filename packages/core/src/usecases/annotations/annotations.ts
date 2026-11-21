import { z } from "zod";
import {
  type Annotation,
  annotationColors,
  annotationPayloadSchema,
  type NewAnnotationInput,
  newAnnotationInput,
} from "../../domain/annotation";
import { textQuoteSchema } from "../../domain/link";
import type { AnnotationRepository, ContentRepository } from "../../ports/repositories";
import type { AnnotationId, ContentId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";

/** Highlights, ink, shapes and comments on a source (Phase 10, doc 21, ADR-0038). */
export interface AnnotationDeps {
  annotations: AnnotationRepository;
  contents: ContentRepository;
}

const firstIssue = (e: z.ZodError, fallback: string) => e.issues[0]?.message ?? fallback;

/**
 * Stores a new annotation on `contentId`. The anchor must be a `content` anchor into that same
 * content. Ink and shapes need their payload; a highlight needs a quote or PDF rects.
 */
export async function createAnnotation(
  deps: AnnotationDeps,
  contentId: ContentId,
  input: NewAnnotationInput | unknown,
): Promise<Result<Annotation>> {
  const parsed = newAnnotationInput.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", firstIssue(parsed.error, "Invalid annotation.")));
  }
  const a = parsed.data;
  if (a.anchor.kind !== "content" || a.anchor.contentId !== contentId) {
    return err(appError("validation", "An annotation must point into its own content."));
  }
  if (!(await deps.contents.get(contentId))) {
    return err(appError("not_found", "This content no longer exists."));
  }
  if ((a.kind === "ink" || a.kind === "shape") && a.payload?.type !== a.kind) {
    return err(appError("validation", `A ${a.kind} annotation needs its drawing.`));
  }
  if (a.kind === "highlight" && !a.anchor.quote && !a.anchor.rects?.length) {
    return err(appError("validation", "Select some text to highlight."));
  }
  if (a.kind === "comment" && !a.comment) {
    return err(appError("validation", "Write a comment first."));
  }
  const anchor = a.anchor as Annotation["anchor"];
  return ok(
    await deps.annotations.create({
      contentId,
      kind: a.kind,
      anchor,
      color: a.color,
      comment: a.comment || null,
      payload: a.payload,
    }),
  );
}

/** In reading order (page, time or paragraph, then creation time). */
export async function listAnnotations(
  deps: Pick<AnnotationDeps, "annotations">,
  contentId: ContentId,
): Promise<Annotation[]> {
  return deps.annotations.listByContent(contentId);
}

export const annotationPatchSchema = z
  .object({
    color: z.enum(annotationColors).optional(),
    comment: z.string().trim().max(4000).nullable().optional(),
    payload: annotationPayloadSchema.nullable().optional(),
    quote: textQuoteSchema.optional(),
  })
  .strict();
export type AnnotationPatch = z.input<typeof annotationPatchSchema>;

/** Changes colour, comment, drawing or quote. A comment-only annotation cannot lose its text. */
export async function updateAnnotation(
  deps: Pick<AnnotationDeps, "annotations">,
  id: AnnotationId,
  patch: AnnotationPatch | unknown,
): Promise<Result<Annotation>> {
  const parsed = annotationPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return err(appError("validation", firstIssue(parsed.error, "Invalid change.")));
  }
  const current = await deps.annotations.get(id);
  if (!current) return err(appError("not_found", "This annotation no longer exists."));
  const p = parsed.data;
  const comment = p.comment === undefined ? undefined : p.comment || null;
  if (current.kind === "comment" && comment === null) {
    return err(appError("validation", "A comment needs some text. Delete it instead."));
  }
  if (p.payload !== undefined && current.kind !== "highlight" && current.kind !== "comment") {
    if (p.payload?.type !== current.kind) {
      return err(appError("validation", `A ${current.kind} annotation needs its drawing.`));
    }
  }
  await deps.annotations.update(id, {
    ...(p.color !== undefined ? { color: p.color } : {}),
    ...(comment !== undefined ? { comment } : {}),
    ...(p.payload !== undefined ? { payload: p.payload } : {}),
    ...(p.quote !== undefined ? { anchor: { ...current.anchor, quote: p.quote } } : {}),
  });
  const next = await deps.annotations.get(id);
  return next ? ok(next) : err(appError("not_found", "This annotation no longer exists."));
}

export async function deleteAnnotation(
  deps: Pick<AnnotationDeps, "annotations">,
  id: AnnotationId,
): Promise<Result<void>> {
  if (!(await deps.annotations.get(id))) {
    return err(appError("not_found", "This annotation no longer exists."));
  }
  await deps.annotations.delete(id);
  return ok(undefined);
}
