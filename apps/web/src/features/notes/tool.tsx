"use client";

import { Button, cx } from "@thoth/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LearnTool, LearnToolProps } from "@/features/learn-panel/types";
import { Callout } from "@/features/summary/callout";
import { Dialog } from "@/features/summary/dialog";
import { Markdown } from "@/features/summary/markdown";
import { draftNotesAction, loadNoteAction, saveNoteAction } from "./actions";

const AUTOSAVE_MS = 800;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const saveLabel: Record<SaveState, string> = {
  idle: "",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Could not save",
};

function NotesPanel({ contentId, onCite }: LearnToolProps) {
  const [text, setText] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [askDraft, setAskDraft] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // The latest unsaved text, so a blur or unmount can flush it.
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadNoteAction(contentId)
      .then((n) => !cancelled && setText(n.markdown))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    setSave("saving");
    try {
      const r = await saveNoteAction(contentId, value);
      if (r.ok) {
        setSaveError(null);
        // Typing during the request leaves newer text pending; keep showing "unsaved" then.
        setSave(pending.current === null ? "saved" : "dirty");
      } else {
        pending.current ??= value;
        setSaveError(r.error);
        setSave("error");
      }
    } catch {
      pending.current ??= value;
      setSaveError("Could not reach the server. Your text is still here.");
      setSave("error");
    }
  }, [contentId]);

  const change = useCallback(
    (value: string) => {
      setText(value);
      pending.current = value;
      setSave("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  // Save what is still pending when the panel closes.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const value = pending.current;
      if (value !== null) void saveNoteAction(contentId, value);
    },
    [contentId],
  );

  async function draft(mode: "replace" | "append") {
    setAskDraft(false);
    setDrafting(true);
    setDraftError(null);
    try {
      const r = await draftNotesAction(contentId, "English");
      if (!r.ok) return setDraftError(r.error);
      const current = pending.current ?? text ?? "";
      change(
        mode === "append" && current.trim()
          ? `${current.trimEnd()}\n\n${r.markdown}\n`
          : `${r.markdown}\n`,
      );
      void flush();
    } catch {
      setDraftError("Could not reach the server. Try again.");
    } finally {
      setDrafting(false);
    }
  }

  if (loadFailed) {
    return (
      <Callout variant="danger" title="Notes did not load">
        Reload the page to try again.
      </Callout>
    );
  }
  if (text === null) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />;
  }

  const hasText = text.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="type-heading-3 text-ink">Notes</h3>
        <div className="flex items-center gap-3">
          <p
            role="status"
            className={cx("type-caption", save === "error" ? "text-danger" : "text-ink-muted")}
          >
            {saveLabel[save]}
          </p>
          <Button
            variant="secondary"
            disabled={drafting}
            onClick={() => (hasText ? setAskDraft(true) : void draft("replace"))}
          >
            {drafting ? "Drafting" : "Draft notes with Claude"}
          </Button>
        </div>
      </div>

      {drafting && (
        <p role="status" className="type-caption text-ink-muted">
          Claude is reading the source and drafting notes. This takes up to a minute.
        </p>
      )}
      {draftError && (
        <Callout variant="danger" title="Claude could not draft notes">
          {draftError}
        </Callout>
      )}
      {save === "error" && saveError && (
        <Callout variant="danger" title="Your notes are not saved yet">
          {saveError}
        </Callout>
      )}

      <div className="@container">
        <div className="grid gap-4 @2xl:grid-cols-2">
          <div className="field max-w-none">
            <label htmlFor={`notes-${contentId}`} className="field__label">
              Write (Markdown)
            </label>
            <textarea
              id={`notes-${contentId}`}
              className="field__input h-auto min-h-80 resize-y py-3 font-mono"
              placeholder="Write notes here. Use # for headings, - for bullets, and [p.3] or [01:46] to link to the source."
              value={text}
              onChange={(e) => change(e.target.value)}
              onBlur={() => void flush()}
              disabled={drafting}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="field__label">Preview</h4>
            <div className="min-h-80 rounded-lg border border-border-subtle bg-surface-200 p-4">
              {hasText ? (
                <Markdown source={text} onCite={onCite} />
              ) : (
                <p className="text-ink-muted">Your notes appear here as you type.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={askDraft} onClose={() => setAskDraft(false)} title="Replace your notes?">
        <p className="modal__body">
          You already have notes here. Claude can add its draft below them, or replace them with the
          draft. Replacing cannot be undone.
        </p>
        <div className="modal__actions">
          <Button variant="ghost" onClick={() => setAskDraft(false)}>
            Cancel
          </Button>
          <Button onClick={() => void draft("append")}>Add below</Button>
          <Button variant="danger" onClick={() => void draft("replace")}>
            Replace notes
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

export const notesTool: LearnTool = {
  id: "notes",
  label: "Notes",
  description: "Your own notes, with help from Claude.",
  Panel: NotesPanel,
};
