"use server";

import { type ContentId, createSpace, moveContentToSpace, type SpaceId } from "@thoth/core";
import { refresh } from "next/cache";
import { getContainer } from "@/server/container";

export type CreateSpaceState = { error: string | null };

/** Thin adapter: FormData -> use case -> UI state. No business rules here. */
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

/** Moves a content into this space, or out of it with spaceId null (ADR-0018). */
export async function moveContentAction(
  contentId: ContentId,
  spaceId: SpaceId | null,
): Promise<{ error: string | null }> {
  const r = await moveContentToSpace(await getContainer(), { contentId, spaceId });
  if (!r.ok) return { error: r.error.message };
  refresh();
  return { error: null };
}
