"use server";

import {
  type AccentColor,
  type ContentId,
  createSpace,
  createTag,
  deleteTag,
  getSpaceDashboard,
  moveContent,
  type SpaceDashboard,
  type SpaceId,
  setContentTags,
  type Tag,
  type TagId,
  type UpdateSpaceInput,
  updateSpace,
  updateTag,
} from "@thoth/core";
import { refresh } from "next/cache";
import { getContainer } from "@/server/container";

/** Thin adapters over the space use cases (doc 22). No business rules here. */

export type CreateSpaceState = { error: string | null };
export type ActionResult<T = null> = { ok: true; value: T } | { ok: false; error: string };

export async function createSpaceAction(
  _prev: CreateSpaceState,
  form: FormData,
): Promise<CreateSpaceState> {
  const { spaces } = await getContainer();
  const result = await createSpace({ spaces }, { name: String(form.get("name") ?? "") });
  if (!result.ok) return { error: result.error.message };
  refresh();
  return { error: null };
}

/**
 * Moves a content into a space, or out of every space with spaceId null (ADR-0018).
 * Returns where it was, so the caller can offer Undo.
 */
export async function moveContentAction(
  contentId: string,
  spaceId: string | null,
): Promise<ActionResult<{ from: string | null }>> {
  const r = await moveContent(await getContainer(), {
    contentId: contentId as ContentId,
    spaceId: spaceId as SpaceId | null,
  });
  if (!r.ok) return { ok: false, error: r.error.message };
  refresh();
  return { ok: true, value: { from: r.value.from } };
}

export async function updateSpaceAction(
  spaceId: string,
  patch: UpdateSpaceInput,
): Promise<ActionResult> {
  const r = await updateSpace(await getContainer(), spaceId as SpaceId, patch);
  if (!r.ok) return { ok: false, error: r.error.message };
  refresh();
  return { ok: true, value: null };
}

// ---- tags -------------------------------------------------------------------------------

export async function createTagAction(
  name: string,
  color: AccentColor,
): Promise<ActionResult<Tag>> {
  const r = await createTag(await getContainer(), { name, color });
  return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error.message };
}

export async function updateTagAction(
  tagId: string,
  name: string,
  color: AccentColor,
): Promise<ActionResult<Tag>> {
  const r = await updateTag(await getContainer(), tagId as TagId, { name, color });
  if (!r.ok) return { ok: false, error: r.error.message };
  refresh();
  return { ok: true, value: r.value };
}

export async function deleteTagAction(tagId: string): Promise<ActionResult> {
  const r = await deleteTag(await getContainer(), tagId as TagId);
  if (!r.ok) return { ok: false, error: r.error.message };
  refresh();
  return { ok: true, value: null };
}

export async function setContentTagsAction(
  contentId: string,
  tagIds: string[],
): Promise<ActionResult<Tag[]>> {
  const r = await setContentTags(await getContainer(), {
    contentId: contentId as ContentId,
    tagIds,
  });
  if (!r.ok) return { ok: false, error: r.error.message };
  refresh();
  return { ok: true, value: r.value };
}

/** The dashboard, computed for the browser's day (`tzOffsetMin` = `getTimezoneOffset()`). */
export async function loadSpaceDashboardAction(
  spaceId: string,
  tzOffsetMin: number,
): Promise<ActionResult<SpaceDashboard>> {
  const c = await getContainer();
  const r = await getSpaceDashboard(c, spaceId as SpaceId, {
    now: new Date(),
    tzOffsetMin: Number.isFinite(tzOffsetMin) ? tzOffsetMin : 0,
  });
  return r.ok ? r : { ok: false, error: r.error.message };
}
