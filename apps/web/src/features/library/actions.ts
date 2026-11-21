"use server";

import { addContent, addPlaylist, type ContentId, retryContent, type SpaceId } from "@thoth/core";
import { refresh } from "next/cache";
import { getContainer } from "@/server/container";
import { wakeJobRunner } from "@/server/jobs/runner";

export type AddContentState = { error: string | null; addedAt: number | null };

/** Thin adapter: FormData -> addContent -> UI state. Link kind is detected in core. */
export async function addLinkAction(
  _prev: AddContentState,
  form: FormData,
): Promise<AddContentState> {
  const result = await addContent(await getContainer(), {
    kind: "link",
    url: String(form.get("url") ?? ""),
    spaceId: spaceOf(form),
  });
  if (!result.ok) return { error: result.error.message, addedAt: null };
  wakeJobRunner();
  refresh();
  return { error: null, addedAt: Date.now() };
}

export async function addTextAction(
  _prev: AddContentState,
  form: FormData,
): Promise<AddContentState> {
  const result = await addContent(await getContainer(), {
    kind: "text",
    text: String(form.get("text") ?? ""),
    spaceId: spaceOf(form),
  });
  if (!result.ok) return { error: result.error.message, addedAt: null };
  wakeJobRunner();
  refresh();
  return { error: null, addedAt: Date.now() };
}

export async function retryContentAction(form: FormData): Promise<void> {
  const id = String(form.get("contentId") ?? "") as ContentId;
  const result = await retryContent(await getContainer(), id);
  if (result.ok) wakeJobRunner();
  refresh();
}

/** The space a composer on a space page adds into (doc 22), or none. */
function spaceOf(form: FormData): string | null {
  const v = form.get("spaceId");
  return typeof v === "string" && v ? v : null;
}

export type AddPlaylistState = AddContentState & {
  /** "Added 12 videos from Course. 3 were already here." */
  notice: string | null;
};

/** A YouTube playlist: one normal YouTube ingest per video, into the chosen space (doc 22). */
export async function addPlaylistAction(
  _prev: AddPlaylistState,
  form: FormData,
): Promise<AddPlaylistState> {
  const space = spaceOf(form);
  const r = await addPlaylist(await getContainer(), {
    url: String(form.get("url") ?? ""),
    spaceId: space as SpaceId | null,
  });
  if (!r.ok) return { error: r.error.message, addedAt: null, notice: null };
  if (r.value.added.length > 0) wakeJobRunner();
  refresh();
  const { added, skipped, truncated, title } = r.value;
  const parts = [
    `Added ${added.length} ${added.length === 1 ? "video" : "videos"}${title ? ` from ${title}` : ""}.`,
    skipped > 0 ? `${skipped} ${skipped === 1 ? "was" : "were"} already in your library.` : "",
    truncated > 0 ? `${truncated} more were left out; import at most 200 at a time.` : "",
  ];
  return { error: null, addedAt: Date.now(), notice: parts.filter(Boolean).join(" ") };
}
