"use client";

import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveNoteAction } from "./actions";
import { serializeNote } from "./editor/markdown";

export const AUTOSAVE_MS = 800;

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Debounced autosave of the editor as Markdown through `saveNoteAction` (core `saveNote`, which
 * records the `note_edit` activity). Saves 800 ms after the last edit, at once on blur, and what
 * is still pending when the panel unmounts. One save at a time; unchanged text is not resent.
 */
export function useAutosave(contentId: string, editor: Editor | null) {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const lastSaved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (!editor || editor.isDestroyed || !dirty.current) return;
    dirty.current = false;
    const markdown = serializeNote(editor);
    if (markdown === lastSaved.current) {
      setState((s) => (s === "saving" ? "saved" : s));
      return;
    }
    setState("saving");
    const save = (async () => {
      try {
        const r = await saveNoteAction(contentId, markdown);
        if (r.ok) {
          lastSaved.current = markdown;
          setError(null);
          setState(dirty.current ? "saving" : "saved");
        } else {
          dirty.current = true;
          setError(r.error);
          setState("error");
        }
      } catch {
        dirty.current = true;
        setError("Could not reach the server. Your notes are still here; keep typing to retry.");
        setState("error");
      }
    })();
    inFlight.current = save;
    await save;
    inFlight.current = null;
  }, [contentId, editor]);

  /** Call on every edit. */
  const schedule = useCallback(() => {
    dirty.current = true;
    setState((s) => (s === "error" ? s : "saving"));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }, [flush]);

  /** Call after loading, so the loaded text is not saved back. */
  const markSaved = useCallback((markdown: string) => {
    lastSaved.current = markdown;
    dirty.current = false;
    setState("idle");
  }, []);

  // Save what is still pending when the panel closes. The editor is destroyed after this runs.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (dirty.current && editor && !editor.isDestroyed) {
        void saveNoteAction(contentId, serializeNote(editor));
      }
    },
    [contentId, editor],
  );

  return { state, error, schedule, flush, markSaved };
}
