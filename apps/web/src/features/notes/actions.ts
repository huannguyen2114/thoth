"use server";

import {
  type ContentId,
  getNote,
  type NoteOwner,
  type NotesDraftSnapshot,
  type SpaceId,
  saveNote,
  streamNotesDraft,
} from "@thoth/core";
import { after } from "next/server";
import { getContainer } from "@/server/container";
import { notesDraftRuns } from "./draft-runs";

async function deps() {
  const c = await getContainer();
  return {
    contents: c.contents,
    segments: c.segments,
    notes: c.notes,
    activity: c.activity,
    spaces: c.spaces,
    links: c.links,
    llm: () => c.llm(),
  };
}

/** `content:<id>` or `space:<id>` (core `noteOwnerKey`) back into an owner. */
function ownerFrom(key: string): NoteOwner {
  const at = key.indexOf(":");
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  if (at === -1 || !id) throw new Error(`Bad notes owner key: ${key}`);
  return kind === "space" ? { spaceId: id as SpaceId } : { contentId: id as ContentId };
}

export async function loadNoteAction(ownerKey: string): Promise<{ markdown: string }> {
  const { markdown } = await getNote(await deps(), ownerFrom(ownerKey));
  return { markdown };
}

export type SaveNoteResult = { ok: true; savedAt: number } | { ok: false; error: string };

/** Called by the editor's debounced autosave. `saveNote` records the `note_edit` activity. */
export async function saveNoteAction(ownerKey: string, markdown: string): Promise<SaveNoteResult> {
  const r = await saveNote(await deps(), ownerFrom(ownerKey), markdown);
  return r.ok
    ? { ok: true, savedAt: r.value.updatedAt.getTime() }
    : { ok: false, error: r.error.message };
}

export type StartDraftResult = { ok: true; draftId: string } | { ok: false; error: string };

/**
 * Starts "Draft notes with Claude" and returns at once. Claude writes in the background
 * (`after()`), and the editor polls `readDraftAction` for new text (doc 12: Server Actions run
 * one at a time per client, so a long streaming action would block autosave).
 */
export async function startDraftAction(
  contentId: string,
  language: string,
): Promise<StartDraftResult> {
  const abort = new AbortController();
  const r = await streamNotesDraft(await deps(), contentId as ContentId, {
    language,
    signal: abort.signal,
  });
  if (!r.ok) return { ok: false, error: r.error.message };
  const run = notesDraftRuns().start(contentId as ContentId, r.value, abort);
  after(() => run.done);
  return { ok: true, draftId: run.id };
}

/** The draft text after `from`, and its status. Null when the draft is unknown or expired. */
export async function readDraftAction(
  draftId: string,
  from: number,
): Promise<NotesDraftSnapshot | null> {
  return notesDraftRuns().read(draftId, from);
}

/** Stops Claude. What it wrote so far stays in the editor. */
export async function cancelDraftAction(draftId: string): Promise<void> {
  notesDraftRuns().cancel(draftId);
}
