"use client";

import { Button, cx, Dialog } from "@thoth/ui";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LearnTool, LearnToolProps } from "@/features/learn-panel/types";
import { loadNoteAction } from "./actions";
import { Callout } from "./callout";
import { notesExtensions } from "./editor/extensions";
import { NotesLinksLayer, useNotesLinks } from "./editor/link-picker";
import { EMPTY_DOC, parseNote } from "./editor/markdown";
import { PROSE } from "./editor/prose";
import { SlashMenu, useSlashMenu } from "./editor/slash-menu";
import { Toolbar } from "./editor/toolbar";
import { type SaveState, useAutosave } from "./use-autosave";
import { type DraftMode, useDraft } from "./use-draft";

const saveLabel: Record<SaveState, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
};

/** The Notes panel on a content page: the editor, owned by that content. */
function NotesPanel({ contentId, onCite }: LearnToolProps) {
  return (
    <NotesEditor ownerKey={`content:${contentId}`} draftContentId={contentId} onCite={onCite} />
  );
}

/**
 * The notes editor (ADR-0022, doc 12): one live-preview editor, stored as Markdown.
 * It fills whatever box it is given: the toolbar wraps, and the text scrolls on its own.
 *
 * `ownerKey` is `content:<id>` or `space:<id>` (core `noteOwnerKey`); space notes use it on the
 * space page (Phase 10, doc 22). "Draft notes with Claude" needs a source, so it shows only
 * when `draftContentId` is given.
 */
export function NotesEditor({
  ownerKey,
  draftContentId,
  onCite,
}: {
  ownerKey: string;
  draftContentId?: string;
  onCite?: ((token: string) => void) | undefined;
}) {
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [askDraft, setAskDraft] = useState(false);
  const cite = useRef(onCite);
  cite.current = onCite;
  const slash = useSlashMenu();
  const links = useNotesLinks(ownerKey);
  const onEdit = useRef<() => void>(() => {});
  const onBlur = useRef<() => void>(() => {});

  const extensions = useMemo(
    () =>
      notesExtensions({
        onCite: (token) => cite.current?.(token),
        slash: slash.options,
        links: links.extensionOptions,
        onOpenLink: links.onOpenLink,
      }),
    [slash.options, links.extensionOptions, links.onOpenLink],
  );

  const editor = useEditor({
    extensions,
    content: EMPTY_DOC,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: PROSE,
        "aria-label": "Notes",
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "true",
      },
    },
    onUpdate: () => onEdit.current(),
    onBlur: () => onBlur.current(),
  });
  slash.bind(editor);
  links.bind(editor);

  const autosave = useAutosave(ownerKey, editor);
  onBlur.current = () => void autosave.flush();

  const draft = useDraft({
    contentId: draftContentId ?? "",
    editor,
    // Follow the end of the draft in whichever box scrolls (our panel, or the page).
    onProgress: () => editor?.view.dom.lastElementChild?.scrollIntoView({ block: "nearest" }),
  });

  onEdit.current = () => {
    autosave.schedule();
    if (!draft.busy && (draft.stopped || draft.error)) draft.dismiss();
  };

  // Load the saved Markdown once the editor exists. Loading is not an edit: no save, no undo.
  const { markSaved } = autosave;
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    setLoaded(false);
    loadNoteAction(ownerKey)
      .then(({ markdown }) => {
        if (cancelled || editor.isDestroyed) return;
        const doc = editor.schema.nodeFromJSON(parseNote(editor, markdown));
        const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content);
        editor.view.dispatch(tr.setMeta("addToHistory", false).setMeta("preventUpdate", true));
        markSaved(markdown);
        editor.setEditable(true, false);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [editor, ownerKey, markSaved]);

  function requestDraft() {
    if (editor && !editor.isEmpty) setAskDraft(true);
    else void runDraft("replace");
  }

  async function runDraft(mode: DraftMode) {
    setAskDraft(false);
    await autosave.flush();
    await draft.start(mode);
  }

  if (loadFailed) {
    return (
      <Callout variant="danger" title="Notes did not load">
        Reload the page to try again.
      </Callout>
    );
  }

  const status =
    draft.phase === "starting"
      ? "Claude is reading the source…"
      : draft.phase === "writing"
        ? "Claude is writing…"
        : draft.phase === "stopping"
          ? "Stopping…"
          : saveLabel[autosave.state];

  return (
    <div className="@container flex h-full min-h-0 flex-col gap-3">
      <div className="mx-auto flex w-full max-w-2xl shrink-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="type-heading-3 text-ink select-none">Notes</h3>
          <p
            role="status"
            className={cx(
              "type-caption select-none",
              autosave.state === "error" && !draft.busy ? "text-danger" : "text-ink-muted",
            )}
          >
            {status}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {draft.busy ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={draft.stop}
                disabled={draft.phase === "stopping"}
              >
                Stop
              </Button>
            ) : draftContentId ? (
              <Button size="sm" variant="secondary" onClick={requestDraft} disabled={!loaded}>
                Draft notes with Claude
              </Button>
            ) : null}
          </div>
        </div>
        {editor && loaded && <Toolbar editor={editor} disabled={draft.busy} />}
      </div>

      {draft.error && (
        <Callout
          variant="danger"
          title="Claude could not draft notes"
          className="mx-auto w-full max-w-2xl shrink-0"
        >
          {draft.error}
        </Callout>
      )}
      {draft.stopped && !draft.busy && (
        <Callout variant="info" title="Draft stopped" className="mx-auto w-full max-w-2xl shrink-0">
          What Claude wrote so far is in your notes. Press {undoKey()} to remove it.
        </Callout>
      )}
      {autosave.state === "error" && autosave.error && (
        <Callout
          variant="danger"
          title="Your notes are not saved yet"
          className="mx-auto w-full max-w-2xl shrink-0"
        >
          {autosave.error}
        </Callout>
      )}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: a mouse shortcut to the end of the text; keyboard users are already in the editor */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        // Clicking the empty space below the text puts the caret at the end, like a page.
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && editor?.isEditable) {
            e.preventDefault();
            editor.commands.focus("end");
          }
        }}
      >
        {!loaded && (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <div className="h-8 w-1/2 animate-pulse rounded-md bg-surface-300" />
            <div className="h-4 w-full animate-pulse rounded-md bg-surface-300" />
            <div className="h-4 w-5/6 animate-pulse rounded-md bg-surface-300" />
          </div>
        )}
        <div className={cx("mx-auto max-w-2xl", !loaded && "hidden")} aria-busy={draft.busy}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <NotesLinksLayer links={links} editor={editor} loaded={loaded} />
      <SlashMenu
        editor={editor}
        open={slash.open}
        items={slash.items}
        index={slash.index}
        setIndex={slash.setIndex}
      />

      {askDraft && (
        <Dialog
          onClose={() => setAskDraft(false)}
          title="Add Claude's draft?"
          actions={
            <>
              <Button variant="ghost" onClick={() => setAskDraft(false)}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={() => void runDraft("replace")}>
                Replace notes
              </Button>
              <Button variant="primary" onClick={() => void runDraft("append")}>
                Add below
              </Button>
            </>
          }
        >
          <p className="modal__body">
            You already have notes here. Claude can write its draft below them, or replace them. You
            can undo either with {undoKey()}.
          </p>
        </Dialog>
      )}
    </div>
  );
}

function undoKey(): string {
  return typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform)
    ? "⌘Z"
    : "Ctrl+Z";
}

export const notesTool: LearnTool = {
  id: "notes",
  label: "Notes",
  description: "Your own notes, with help from Claude.",
  Panel: NotesPanel,
};
