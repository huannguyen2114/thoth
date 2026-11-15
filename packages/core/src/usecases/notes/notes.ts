import { z } from "zod";
import type { Note } from "../../domain/note";
import type { LlmProvider } from "../../ports/llm";
import type {
  ContentRepository,
  NoteRepository,
  SegmentRepository,
} from "../../ports/repositories";
import type { ContentId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { buildSourceContext } from "../summary/prompts";
import { MAX_SOURCE_CHARS } from "../summary/summary";
import { buildNotesSystem, notesUserMessage } from "./prompts";

export interface NotesDeps {
  contents: ContentRepository;
  segments: SegmentRepository;
  notes: NoteRepository;
  llm: () => Promise<LlmProvider>;
}

export const MAX_NOTES_CHARS = 200_000;

const markdownSchema = z.string().max(MAX_NOTES_CHARS, "These notes are too long to save.");

/** The saved note, or an empty one when none exists yet (nothing is written). */
export async function getNote(
  deps: Pick<NotesDeps, "notes">,
  contentId: ContentId,
): Promise<{ markdown: string; updatedAt: Date | null }> {
  const note: Note | null = await deps.notes.get(contentId);
  return note
    ? { markdown: note.markdown, updatedAt: note.updatedAt }
    : { markdown: "", updatedAt: null };
}

export async function saveNote(
  deps: Pick<NotesDeps, "contents" | "notes">,
  contentId: ContentId,
  markdown: string,
): Promise<Result<Note>> {
  const parsed = markdownSchema.safeParse(markdown);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid notes."));
  }
  if (!(await deps.contents.get(contentId))) {
    return err(appError("not_found", "This content no longer exists."));
  }
  return ok(await deps.notes.save(contentId, parsed.data));
}

/**
 * Asks Claude for structured study notes. Returns the markdown and does NOT save it:
 * the editor decides whether to replace or append, then autosave stores it.
 */
export async function draftNotes(
  deps: NotesDeps,
  contentId: ContentId,
  options: { language?: string } = {},
): Promise<Result<string>> {
  const content = await deps.contents.get(contentId);
  if (!content) return err(appError("not_found", "This content no longer exists."));
  if (content.status !== "ready") {
    return err(appError("validation", "This content is still being processed. Try again soon."));
  }
  const segments = (await deps.segments.listByContent(contentId)).sort((a, b) => a.idx - b.idx);
  if (segments.length === 0) {
    return err(appError("validation", "This content has no text to take notes from."));
  }
  const context = buildSourceContext(segments);
  if (context.length > MAX_SOURCE_CHARS) {
    return err(appError("validation", "This source is too long to draft notes from at once."));
  }

  const llm = await deps.llm();
  const reply = await llm.generateText({
    task: "summary",
    system: buildNotesSystem(options.language?.trim() || "English"),
    context,
    messages: [{ role: "user", content: notesUserMessage }],
  });
  if (!reply.ok) return reply;
  const text = reply.value.trim();
  if (text === "")
    return err(appError("llm_bad_output", "Claude returned empty notes. Try again."));
  return ok(text);
}
