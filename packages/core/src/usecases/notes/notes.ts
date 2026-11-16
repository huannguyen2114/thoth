import { z } from "zod";
import type { Note } from "../../domain/note";
import type { LlmProvider } from "../../ports/llm";
import type {
  ActivityRepository,
  ContentRepository,
  NoteRepository,
  SegmentRepository,
} from "../../ports/repositories";
import type { ContentId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { recordActivity } from "../activity";
import { buildSourceContext } from "../summary/prompts";
import { MAX_SOURCE_CHARS } from "../summary/summary";
import { buildNotesSystem, notesUserMessage } from "./prompts";

export interface NotesDeps {
  contents: ContentRepository;
  segments: SegmentRepository;
  notes: NoteRepository;
  llm: () => Promise<LlmProvider>;
  activity?: ActivityRepository;
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
  deps: Pick<NotesDeps, "contents" | "notes" | "activity">,
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
  const note = await deps.notes.save(contentId, parsed.data);
  await recordActivity(deps.activity, "note_edit", contentId);
  return ok(note);
}

type DraftPlan = { system: string; context: string };

/** Shared checks for both draft flavours: content ready, has text, fits in one request. */
async function planDraft(
  deps: NotesDeps,
  contentId: ContentId,
  language: string | undefined,
): Promise<Result<DraftPlan>> {
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
  return ok({ system: buildNotesSystem(language?.trim() || "English"), context });
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
  const plan = await planDraft(deps, contentId, options.language);
  if (!plan.ok) return plan;
  const llm = await deps.llm();
  const reply = await llm.generateText({
    task: "summary",
    ...plan.value,
    messages: [{ role: "user", content: notesUserMessage }],
  });
  if (!reply.ok) return reply;
  const text = reply.value.trim();
  if (text === "")
    return err(appError("llm_bad_output", "Claude returned empty notes. Try again."));
  return ok(text);
}

/** What a streamed notes draft yields. It ends with exactly one `done` or `error`. */
export type NotesDraftEvent =
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Streaming variant of `draftNotes` (ADR-0022): validates first, so an expected failure is a
 * `Result` before any token arrives, then yields the Markdown as Claude writes it.
 * Like `draftNotes` it saves nothing. Abort `signal` to stop Claude.
 */
export async function streamNotesDraft(
  deps: NotesDeps,
  contentId: ContentId,
  options: { language?: string; signal?: AbortSignal } = {},
): Promise<Result<AsyncIterable<NotesDraftEvent>>> {
  const plan = await planDraft(deps, contentId, options.language);
  if (!plan.ok) return plan;
  const llm = await deps.llm();
  const request = {
    task: "summary" as const,
    ...plan.value,
    messages: [{ role: "user" as const, content: notesUserMessage }],
    ...(options.signal ? { signal: options.signal } : {}),
  };
  async function* events(): AsyncIterable<NotesDraftEvent> {
    let wrote = false;
    for await (const e of llm.streamText(request)) {
      if (e.type === "text") {
        if (e.delta === "") continue;
        wrote ||= e.delta.trim() !== "";
        yield { type: "text", delta: e.delta };
      } else if (e.type === "error") {
        yield { type: "error", message: e.message };
        return;
      } else {
        yield wrote
          ? { type: "done" }
          : { type: "error", message: "Claude returned empty notes. Try again." };
        return;
      }
    }
    // The provider ended without a final event (for example after an abort).
    yield wrote ? { type: "done" } : { type: "error", message: "Claude stopped before writing." };
  }
  return ok(events());
}
