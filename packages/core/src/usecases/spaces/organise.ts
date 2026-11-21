import { type Space, type UpdateSpaceInput, updateSpaceInput } from "../../domain/space";
import { type AccentColor, type Tag, tagInput } from "../../domain/tag";
import type { ContentRepository, SpaceRepository, TagRepository } from "../../ports/repositories";
import type { ContentId, SpaceId, TagId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";

/**
 * Organising a library (Phase 10, doc 22): a space's name, colour and icon, moving contents
 * between spaces, and tags on contents. Every rule lives here; Server Actions only adapt.
 */

const firstIssue = (e: { issues: { message: string }[] }, fallback: string) =>
  e.issues[0]?.message ?? fallback;

/** Changes only the fields given: name, description, colour (Hearth accent name), icon. */
export async function updateSpace(
  deps: { spaces: SpaceRepository },
  spaceId: SpaceId,
  input: UpdateSpaceInput,
): Promise<Result<Space>> {
  const parsed = updateSpaceInput.safeParse(input);
  if (!parsed.success)
    return err(appError("validation", firstIssue(parsed.error, "Check the space.")));
  if (!(await deps.spaces.get(spaceId))) {
    return err(appError("not_found", "This space no longer exists."));
  }
  await deps.spaces.update(spaceId, parsed.data);
  const space = await deps.spaces.get(spaceId);
  return space ? ok(space) : err(appError("not_found", "This space no longer exists."));
}

export interface MoveContentResult {
  /** Where the content was before the move, so the UI can offer "Undo". */
  from: SpaceId | null;
  to: SpaceId | null;
}

/**
 * Moves a content into a space, or out of every space with `spaceId: null` (ADR-0018: a content
 * belongs to at most one space). Moving to where it already is succeeds and changes nothing.
 */
export async function moveContent(
  deps: { spaces: SpaceRepository; contents: ContentRepository },
  input: { contentId: ContentId; spaceId: SpaceId | null },
): Promise<Result<MoveContentResult>> {
  const content = await deps.contents.get(input.contentId);
  if (!content) return err(appError("not_found", "This content no longer exists."));
  if (input.spaceId && !(await deps.spaces.get(input.spaceId))) {
    return err(appError("not_found", "This space no longer exists."));
  }
  const from = content.spaceId;
  if (from !== input.spaceId) await deps.contents.setSpace(input.contentId, input.spaceId);
  return ok({ from, to: input.spaceId });
}

// ---- tags -----------------------------------------------------------------------------

export interface TagDeps {
  tags: TagRepository;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Tags sorted by name, for pickers and filter chips. */
export async function listTags(deps: TagDeps): Promise<Tag[]> {
  return (await deps.tags.list()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Creates a tag. A name that already exists (any case) returns the existing tag. */
export async function createTag(
  deps: TagDeps,
  input: { name: string; color?: AccentColor },
): Promise<Result<Tag>> {
  const parsed = tagInput.safeParse(input);
  if (!parsed.success)
    return err(appError("validation", firstIssue(parsed.error, "Check the tag.")));
  const existing = (await deps.tags.list()).find((t) => sameName(t.name, parsed.data.name));
  if (existing) return ok(existing);
  return ok(await deps.tags.create(parsed.data.name, parsed.data.color));
}

/** Renames and recolours a tag. Two tags may not share a name. */
export async function updateTag(
  deps: TagDeps,
  tagId: TagId,
  input: { name: string; color: AccentColor },
): Promise<Result<Tag>> {
  const parsed = tagInput.safeParse(input);
  if (!parsed.success)
    return err(appError("validation", firstIssue(parsed.error, "Check the tag.")));
  const all = await deps.tags.list();
  if (!all.some((t) => t.id === tagId)) {
    return err(appError("not_found", "This tag no longer exists."));
  }
  if (all.some((t) => t.id !== tagId && sameName(t.name, parsed.data.name))) {
    return err(appError("validation", `A tag called "${parsed.data.name}" already exists.`));
  }
  await deps.tags.rename(tagId, parsed.data.name, parsed.data.color);
  return ok({ id: tagId, name: parsed.data.name, color: parsed.data.color });
}

export async function deleteTag(deps: TagDeps, tagId: TagId): Promise<Result<void>> {
  if (!(await deps.tags.list()).some((t) => t.id === tagId)) {
    return err(appError("not_found", "This tag no longer exists."));
  }
  await deps.tags.delete(tagId);
  return ok(undefined);
}

/** Replaces a content's tags. Unknown tag ids are refused, duplicates collapse. */
export async function setContentTags(
  deps: TagDeps & { contents: ContentRepository },
  input: { contentId: ContentId; tagIds: readonly string[] },
): Promise<Result<Tag[]>> {
  if (!(await deps.contents.get(input.contentId))) {
    return err(appError("not_found", "This content no longer exists."));
  }
  const all = await deps.tags.list();
  const byId = new Map(all.map((t) => [t.id as string, t]));
  const ids = [...new Set(input.tagIds)];
  const missing = ids.find((id) => !byId.has(id));
  if (missing) return err(appError("not_found", "One of these tags no longer exists."));
  await deps.tags.setForContent(input.contentId, ids as TagId[]);
  return ok(ids.map((id) => byId.get(id) as Tag));
}

/** contentId → its tags (sorted by name), for library rows and filter chips. */
export async function tagsByContent(deps: TagDeps): Promise<Map<ContentId, Tag[]>> {
  const [tags, assignments] = await Promise.all([deps.tags.list(), deps.tags.listAssignments()]);
  const byId = new Map(tags.map((t) => [t.id, t]));
  const out = new Map<ContentId, Tag[]>();
  for (const a of assignments) {
    const tag = byId.get(a.tagId);
    if (!tag) continue;
    out.set(a.contentId, [...(out.get(a.contentId) ?? []), tag]);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Keeps the items carrying every selected tag (AND), so chips narrow the list as they add up. */
export function filterByTags<T extends { tagIds: readonly string[] }>(
  items: readonly T[],
  selected: readonly string[],
): T[] {
  if (selected.length === 0) return [...items];
  return items.filter((i) => selected.every((t) => i.tagIds.includes(t)));
}
