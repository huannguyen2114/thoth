"use server";

import { type ContentId, draftNotes, getNote, saveNote } from "@thoth/core";
import { getContainer } from "@/server/container";

async function deps() {
  const c = await getContainer();
  return {
    contents: c.contents,
    segments: c.segments,
    notes: c.notes,
    activity: c.activity,
    llm: () => c.llm(),
  };
}

export async function loadNoteAction(contentId: string): Promise<{ markdown: string }> {
  const { markdown } = await getNote(await deps(), contentId as ContentId);
  return { markdown };
}

export type SaveNoteResult = { ok: true; savedAt: number } | { ok: false; error: string };

/** Called by the editor's debounced autosave. */
export async function saveNoteAction(contentId: string, markdown: string): Promise<SaveNoteResult> {
  const r = await saveNote(await deps(), contentId as ContentId, markdown);
  return r.ok
    ? { ok: true, savedAt: r.value.updatedAt.getTime() }
    : { ok: false, error: r.error.message };
}

export type DraftNotesResult = { ok: true; markdown: string } | { ok: false; error: string };

export async function draftNotesAction(
  contentId: string,
  language: string,
): Promise<DraftNotesResult> {
  const r = await draftNotes(await deps(), contentId as ContentId, { language });
  return r.ok ? { ok: true, markdown: r.value } : { ok: false, error: r.error.message };
}
