"use client";

import type { Node as PmNode } from "@tiptap/pm/model";
import type { Editor, JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelDraftAction, readDraftAction, startDraftAction } from "./actions";

const POLL_MS = 250;

export type DraftMode = "append" | "replace";
export type DraftPhase = "idle" | "starting" | "writing" | "stopping";

interface Run {
  id: string | null;
  stopped: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replaces the whole document. Ticks skip history and autosave; the final commit does not. */
function replaceDoc(editor: Editor, content: PmNode["content"], final: boolean) {
  const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, content);
  tr.setMeta("addToHistory", final);
  if (!final) tr.setMeta("preventUpdate", true);
  editor.view.dispatch(tr);
}

function withoutTrailingEmpty(blocks: JSONContent[]): JSONContent[] {
  const out = [...blocks];
  while (out.length && out.at(-1)?.type === "paragraph" && !out.at(-1)?.content?.length) out.pop();
  return out;
}

/**
 * "Draft notes with Claude", streamed into the editor (ADR-0022, doc 12).
 *
 * The draft runs on the server; we poll for new text every 250 ms and re-render
 * "your notes + the draft so far" with the editor's own Markdown parser, so the formatting
 * appears as Claude writes. The editor is read-only meanwhile. At the end the change is one
 * undo step, and the editor's update event starts autosave.
 */
export function useDraft({
  contentId,
  editor,
  onProgress,
}: {
  contentId: string;
  editor: Editor | null;
  /** After each tick, e.g. to keep the end in view. */
  onProgress?: () => void;
}) {
  const [phase, setPhase] = useState<DraftPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const run = useRef<Run | null>(null);
  const progress = useRef(onProgress);
  progress.current = onProgress;

  const start = useCallback(
    async (mode: DraftMode) => {
      if (!editor || run.current) return;
      const me: Run = { id: null, stopped: false };
      run.current = me;
      setError(null);
      setStopped(false);
      setPhase("starting");

      const before = editor.state.doc.content;
      const base =
        mode === "append" && !editor.isEmpty
          ? withoutTrailingEmpty(editor.getJSON().content ?? [])
          : [];
      const show = (markdown: string, final: boolean) => {
        if (editor.isDestroyed || !editor.markdown) return;
        try {
          const draft = editor.markdown.parse(markdown).content ?? [];
          const doc = editor.schema.nodeFromJSON({ type: "doc", content: [...base, ...draft] });
          if (final) replaceDoc(editor, before, false); // so one undo restores your notes
          replaceDoc(editor, doc.content, final);
        } catch {
          // A half-written block that the schema rejects; the next tick fixes it.
        }
      };

      editor.setEditable(false, false);
      let text = "";
      try {
        const started = await startDraftAction(contentId, "English");
        if (!started.ok) {
          setError(started.error);
          return;
        }
        me.id = started.draftId;
        if (me.stopped) void cancelDraftAction(started.draftId);
        else setPhase("writing");

        for (;;) {
          await sleep(POLL_MS);
          if (editor.isDestroyed) {
            void cancelDraftAction(started.draftId);
            return;
          }
          const snap = await readDraftAction(started.draftId, text.length);
          if (!snap) {
            setError("The draft was interrupted. Try again.");
            break;
          }
          if (snap.text) {
            text += snap.text;
            show(text, false);
            progress.current?.();
          }
          if (snap.status === "failed") setError(snap.error ?? "Claude stopped. Try again.");
          if (snap.status === "cancelled") setStopped(true);
          if (snap.status !== "running") break;
        }
      } catch {
        setError("Could not reach the server. Try again.");
      } finally {
        if (!editor.isDestroyed) {
          editor.setEditable(true, false);
          if (text.trim()) {
            show(text, true);
            progress.current?.();
          } else {
            replaceDoc(editor, before, false);
          }
        }
        run.current = null;
        setPhase("idle");
      }
    },
    [contentId, editor],
  );

  /** Stops Claude. What it wrote so far stays. */
  const stop = useCallback(() => {
    const me = run.current;
    if (!me || me.stopped) return;
    me.stopped = true;
    setPhase("stopping");
    if (me.id) void cancelDraftAction(me.id);
  }, []);

  // Closing the panel stops Claude.
  useEffect(
    () => () => {
      const me = run.current;
      if (me?.id && !me.stopped) void cancelDraftAction(me.id);
    },
    [],
  );

  /** Hides the "stopped" and error notices, e.g. once the owner edits again. */
  const dismiss = useCallback(() => {
    setStopped(false);
    setError(null);
  }, []);

  return { phase, error, stopped, start, stop, dismiss, busy: phase !== "idle" };
}
