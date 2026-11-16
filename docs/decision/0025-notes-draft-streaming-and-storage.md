# ADR-0025: Notes drafts stream through a polled in-memory run; editor storage details

- Status: Accepted
- Date: 2026-11-16
- Refines: ADR-0022

## Context

ADR-0022 says "Draft notes with Claude" streams into the editor. The Notes panel talks to the server only through its own Server Actions (the `LearnTool` contract), and Lane 2 owns no route under `app/api/**`.

Next.js 16 dispatches Server Actions **one at a time per client**. One long action that streams the whole draft would block autosave, and every other action on the page, until Claude finishes.

Building the editor also raised three storage questions that ADR-0022 leaves open:

- What a callout is in Markdown.
- What happens to a citation inside bold text.
- How the stored Markdown is normalised.

## Decision

1. **A draft runs in the background and the editor polls it.**
   - `startDraftAction` validates through core `streamNotesDraft` (a `Result` before any token).
   - It registers the event stream in `NotesDraftRuns`, an in-memory registry in `@thoth/core` (`usecases/notes/draft-runs.ts`), and returns a draft id at once. `after()` keeps the run alive.
   - The editor calls `readDraftAction(id, from)` every 250 ms and re-renders "notes + draft so far" with the editor's own Markdown parser.
   - `cancelDraftAction` aborts the model through the request's `AbortSignal`.
   - The registry cancels a draft nobody has read for 30 s (the tab was closed) and forgets finished drafts after 10 minutes.
   - Nothing is saved by the registry. The editor saves the result through `saveNote`, so `note_edit` is still recorded.
2. **A draft is one undo step.** Ticks are applied without history or autosave. The end result is applied as one change, so ⌘Z restores the previous notes, including after "Replace notes".
3. **A callout is a quote with a bold label:** `> **Note:** text` (also `Tip`, `Important` or `Warning`). The editor decorates it as a Hearth callout. There is no new Markdown syntax.
4. **Citation chips carry no marks.** `@tiptap/markdown` 3.32.2 cannot put bold or italic on an inline atom. A chip written inside bold saves just after the bold (`**Main idea** [p.2]`), and the editor shows the same.
5. **Normalisation on save is accepted** when it is stable after one save:
   - brackets in plain text are escaped (`\[0\]`);
   - the trailing empty paragraph is trimmed;
   - list markers and emphasis use the serializer's style (`-`, `1.`, `**`, `*`).

## Alternatives considered

- **An SSE route** (`app/api/notes/draft`), like chat. It gives lower latency and no polling, but it is outside Lane 2's ownership. It would also need a second streaming protocol on the client. It stays a good option if the orchestrator wants one streaming pattern for chat and notes.
- **Streaming through a Server Action** that returns a `ReadableStream`. Rejected because sequential dispatch would block autosave for the whole draft.
- **Persisting the growing draft** like Summary does (`study_sets.body`). Rejected: a note is not a study set, and ADR-0022 says there is no schema change.
- **GitHub alert syntax** (`> [!NOTE]`) for callouts. Rejected because it renders as a literal `[!NOTE]` in many Markdown renderers, and it would need a custom block node and tokenizer.

## Consequences

- Up to 250 ms of latency per tick and a few small requests per second while drafting. Each request takes under 10 ms locally.
- A draft lives in one server process's memory. This is fine for a single-user, single-process app (ADR-0002). It would need a shared store with several processes.
- A server restart during a draft loses only the unsaved draft. The poll then reports "The draft was interrupted".
