"use client";

import { applyOpsToElements, type BoardElement, diffElements } from "@thoth/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyOpsAction,
  type BoardDto,
  loadBoardAction,
  readRunAction,
  startAskAction,
  stopRunAction,
} from "./actions";
import type { RunKind } from "./runs";

export const AUTOSAVE_MS = 500;
const POLL_MS = 800;
const HISTORY = 100;

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface ClaudeRun {
  id: string;
  kind: RunKind;
  phase: "running" | "stopping";
}

export interface RunNotice {
  kind: "summary" | "error" | "stopped";
  text: string;
  skipped?: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One open board: its elements, undo history, autosave and Claude runs (doc 18).
 *
 * Saving: the board on screen is compared with the last version the server confirmed, and
 * only the difference is sent, as operations (`applyOpsAction`). Core applies them on top of
 * the newest version, so a change Claude saved meanwhile is kept. Edits made while a save was
 * in flight are replayed on the server's answer, so nothing typed is lost. If the server
 * refuses the operations (say an element was removed elsewhere), the board reloads and the
 * local change is re-applied where it still fits.
 */
/** Use it in a component keyed by the board id, so every board gets its own state. */
export function useBoard(boardId: string, initialRun: { id: string; kind: RunKind } | null) {
  const [board, setBoard] = useState<Omit<BoardDto, "elements"> | null>(null);
  const [elements, setElementsState] = useState<BoardElement[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [run, setRun] = useState<ClaudeRun | null>(null);
  const [notice, setNotice] = useState<RunNotice | null>(null);
  /** Ids Claude just added or changed: animated in and selected. */
  const [fresh, setFresh] = useState<{ ids: string[]; at: number } | null>(null);
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });

  const current = useRef<BoardElement[]>([]);
  const saved = useRef<BoardElement[]>([]);
  const undoStack = useRef<BoardElement[][]>([]);
  const redoStack = useRef<BoardElement[][]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  const alive = useRef(true);

  const syncHistory = useCallback(
    () => setHistorySize({ undo: undoStack.current.length, redo: redoStack.current.length }),
    [],
  );

  const show = useCallback((next: BoardElement[]) => {
    current.current = next;
    setElementsState(next);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    const id = boardId;
    const sent = current.current;
    const ops = diffElements(saved.current, sent);
    if (ops.length === 0) return;
    setSaveState("saving");
    const save = (async () => {
      try {
        let r = await applyOpsAction(id, ops);
        if (!r.ok) {
          // Refused against the newest board: reload, keep what still applies, try once more.
          const fresh = await loadBoardAction(id);
          if (!fresh.ok) throw new Error(fresh.error);
          const rebased = applyOpsToElements(fresh.value.elements, ops).elements;
          r = await applyOpsAction(id, diffElements(fresh.value.elements, rebased));
          if (!r.ok) {
            saved.current = fresh.value.elements;
            show(fresh.value.elements);
            setBoard(meta(fresh.value));
            throw new Error(`${r.error} The board was reloaded.`);
          }
        }
        const server = r.value;
        // Edits made while saving are replayed on top of what the server now has.
        const pending = diffElements(sent, current.current);
        saved.current = server.elements;
        show(
          pending.length ? applyOpsToElements(server.elements, pending).elements : server.elements,
        );
        setBoard(meta(server));
        setSaveError(null);
        setSaveState(pending.length ? "idle" : "saved");
        if (pending.length) timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
      } catch (e) {
        setSaveState("error");
        setSaveError(e instanceof Error ? e.message : "Check the connection and try again.");
      }
    })();
    inFlight.current = save;
    await save;
    inFlight.current = null;
  }, [boardId, show]);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }, [flush]);

  /** Loads the board; on unmount, saves what is still pending. */
  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    loadBoardAction(boardId)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) return setLoadError(r.error);
        saved.current = r.value.elements;
        show(r.value.elements);
        setBoard(meta(r.value));
        setSaveState("idle");
      })
      .catch(() => !cancelled && setLoadError("Could not load this board. Reload the page."));
    return () => {
      cancelled = true;
      alive.current = false;
      void flush();
    };
  }, [boardId, flush, show]);

  /**
   * Changes the board. `record: false` for live gesture frames (the gesture records one step
   * at its end with `commit`).
   */
  const change = useCallback(
    (fn: (els: BoardElement[]) => BoardElement[], record = true) => {
      const before = current.current;
      const next = fn(before);
      if (next === before) return;
      if (record) {
        undoStack.current = [...undoStack.current.slice(-HISTORY + 1), before];
        redoStack.current = [];
        syncHistory();
      }
      show(next);
      schedule();
    },
    [schedule, show, syncHistory],
  );

  /** Records one undo step for a finished gesture that began at `before`. */
  const commit = useCallback(
    (before: BoardElement[]) => {
      if (before === current.current) return;
      undoStack.current = [...undoStack.current.slice(-HISTORY + 1), before];
      redoStack.current = [];
      syncHistory();
      schedule();
    },
    [schedule, syncHistory],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.at(-1);
    if (!prev) return;
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current, current.current];
    syncHistory();
    show(prev);
    schedule();
  }, [schedule, show, syncHistory]);

  const redo = useCallback(() => {
    const next = redoStack.current.at(-1);
    if (!next) return;
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current, current.current];
    syncHistory();
    show(next);
    schedule();
  }, [schedule, show, syncHistory]);

  /** Polls a Claude run; when it ends, brings its changes in as one undo step. */
  const following = useRef(new Set<string>());
  const follow = useCallback(
    async (id: string, kind: RunKind) => {
      if (following.current.has(id)) return;
      following.current.add(id);
      setRun({ id, kind, phase: "running" });
      for (;;) {
        await sleep(POLL_MS);
        if (!alive.current) return;
        const state = await readRunAction(id).catch(() => undefined);
        if (state === undefined) continue;
        if (state === null) {
          setRun(null);
          return;
        }
        if (state.status === "running") continue;
        setRun(null);
        if (state.status === "failed") {
          setNotice({ kind: "error", text: state.error });
          return;
        }
        if (state.status === "stopped") {
          setNotice({ kind: "stopped", text: "Stopped. Nothing was added." });
          return;
        }
        await flush();
        const r = await loadBoardAction(state.boardId);
        if (!r.ok || !alive.current) return;
        const before = current.current;
        const pending = diffElements(saved.current, before);
        saved.current = r.value.elements;
        const merged = pending.length
          ? applyOpsToElements(r.value.elements, pending).elements
          : r.value.elements;
        undoStack.current = [...undoStack.current.slice(-HISTORY + 1), before];
        redoStack.current = [];
        syncHistory();
        show(merged);
        setBoard(meta(r.value));
        setFresh({ ids: state.outcome.touched, at: Date.now() });
        const { summary, skipped } = state.outcome;
        if (summary || skipped.length) {
          setNotice({ kind: "summary", text: summary, skipped });
        }
        return;
      }
    },
    [flush, show, syncHistory],
  );

  useEffect(() => {
    if (initialRun) void follow(initialRun.id, initialRun.kind);
  }, [initialRun, follow]);

  const ask = useCallback(
    async (request: string, mayChange: string[]): Promise<string | null> => {
      if (run) return null;
      await flush();
      setNotice(null);
      const r = await startAskAction(boardId, request, mayChange);
      if (!r.ok) return r.error;
      void follow(r.value.runId, "ask");
      return null;
    },
    [boardId, run, flush, follow],
  );

  const stop = useCallback(async () => {
    if (!run) return;
    setRun({ ...run, phase: "stopping" });
    await stopRunAction(run.id);
  }, [run]);

  return {
    board,
    elements,
    current,
    loadError,
    saveState,
    saveError,
    run,
    notice,
    dismissNotice: () => setNotice(null),
    fresh,
    canUndo: historySize.undo > 0,
    canRedo: historySize.redo > 0,
    change,
    commit,
    undo,
    redo,
    flush,
    ask,
    stop,
    follow,
    rename: (title: string) => setBoard((b) => (b ? { ...b, title } : b)),
  };
}

const meta = (b: BoardDto): Omit<BoardDto, "elements"> => ({
  id: b.id,
  title: b.title,
  version: b.version,
  updatedAt: b.updatedAt,
});

export type BoardState = ReturnType<typeof useBoard>;
