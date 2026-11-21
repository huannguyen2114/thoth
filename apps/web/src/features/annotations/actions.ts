"use server";

import {
  type Annotation,
  type AnnotationId,
  type Backlinks,
  type ContentId,
  createAnnotation,
  deleteAnnotation,
  getBacklinks,
  highlightToFlashcard,
  type LinkTarget,
  listAnnotations,
  passageToFlashcard,
  type ResolvedLink,
  resolveLink,
  searchLinkTargets,
  updateAnnotation,
} from "@thoth/core";
import { getContainer } from "@/server/container";

/** Thin Server Actions over the annotation use cases (doc 21). Rules live in core. */

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

const wrap = <T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }) =>
  r.ok ? { ok: true as const, value: r.value } : { ok: false as const, error: r.error.message };

/** Dates cross the wire as numbers. */
export type AnnotationDto = Omit<Annotation, "createdAt" | "updatedAt"> & {
  createdAt: number;
  updatedAt: number;
};
const dto = (a: Annotation): AnnotationDto => ({
  ...a,
  createdAt: a.createdAt.getTime(),
  updatedAt: a.updatedAt.getTime(),
});

export async function listAnnotationsAction(contentId: string): Promise<AnnotationDto[]> {
  return (await listAnnotations(await getContainer(), contentId as ContentId)).map(dto);
}

/** Everything a page needs at once: the annotations, the backlinks and the content title. */
export async function loadAnnotationsAction(contentId: string): Promise<{
  title: string;
  items: AnnotationDto[];
  backlinks: Backlinks;
}> {
  const c = await getContainer();
  const [content, items, backlinks] = await Promise.all([
    c.contents.get(contentId as ContentId),
    listAnnotations(c, contentId as ContentId),
    getBacklinks(c, contentId as ContentId),
  ]);
  return { title: content?.title ?? "Source", items: items.map(dto), backlinks };
}

export async function createAnnotationAction(
  contentId: string,
  input: unknown,
): Promise<ActionResult<AnnotationDto>> {
  const r = await createAnnotation(await getContainer(), contentId as ContentId, input);
  return r.ok ? { ok: true, value: dto(r.value) } : { ok: false, error: r.error.message };
}

export async function updateAnnotationAction(
  id: string,
  patch: unknown,
): Promise<ActionResult<AnnotationDto>> {
  const r = await updateAnnotation(await getContainer(), id as AnnotationId, patch);
  return r.ok ? { ok: true, value: dto(r.value) } : { ok: false, error: r.error.message };
}

export async function deleteAnnotationAction(id: string): Promise<ActionResult<void>> {
  return wrap(await deleteAnnotation(await getContainer(), id as AnnotationId));
}

export async function backlinksAction(contentId: string): Promise<Backlinks> {
  return getBacklinks(await getContainer(), contentId as ContentId);
}

export type FlashcardMade = { setTitle: string; front: string; suggested: boolean };

/** Highlight (by id) or a passage that is not stored (summary text) to a flashcard. */
export async function makeFlashcardAction(
  input:
    | { annotationId: string; suggest?: boolean }
    | { contentId: string; quote: string; locator: unknown; suggest?: boolean },
): Promise<ActionResult<FlashcardMade>> {
  const c = await getContainer();
  const deps = { ...c, llm: () => c.llm() };
  const r =
    "annotationId" in input
      ? await highlightToFlashcard(deps, input.annotationId as AnnotationId, {
          suggest: input.suggest ?? false,
        })
      : await passageToFlashcard(deps, input);
  return r.ok
    ? {
        ok: true,
        value: {
          setTitle: r.value.set.title,
          front: r.value.card.front,
          suggested: r.value.suggested,
        },
      }
    : { ok: false, error: r.error.message };
}

export async function searchLinkTargetsAction(
  query: string,
  contentId: string | null,
): Promise<LinkTarget[]> {
  return searchLinkTargets(await getContainer(), {
    query,
    contentId: (contentId ?? null) as ContentId | null,
  });
}

export async function resolveLinkAction(href: string): Promise<ActionResult<ResolvedLink>> {
  return wrap(await resolveLink(await getContainer(), href));
}
