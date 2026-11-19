import "server-only";
import type { AppError, Result } from "@thoth/core";

/** What a finished Claude run left on the board: shown and animated by the canvas. */
export interface RunOutcome {
  summary: string;
  touched: string[];
  skipped: string[];
}

export type RunState =
  | { status: "running"; boardId: string; kind: RunKind; startedAt: number }
  | { status: "done"; boardId: string; kind: RunKind; outcome: RunOutcome }
  | { status: "failed"; boardId: string; kind: RunKind; error: string }
  | { status: "stopped"; boardId: string; kind: RunKind };

export type RunKind = "ask" | "mindmap";

interface Entry {
  state: RunState;
  abort: AbortController;
  finishedAt?: number;
}

/** Finished runs are kept this long so the panel can pick up the result after a reload. */
const KEEP_MS = 10 * 60 * 1000;

/**
 * Claude runs on whiteboards ("Ask Claude…", "Mind map"), in the background (ADR-0016's
 * pattern): the action starts one and returns its id, `after()` keeps it going, and the panel
 * polls. Server Actions run one at a time per client, so awaiting Claude in an action would
 * hold up autosave. The run itself saves into the board, so closing the panel loses nothing.
 */
export class WhiteboardRuns {
  private runs = new Map<string, Entry>();

  start(
    boardId: string,
    kind: RunKind,
    work: (signal: AbortSignal) => Promise<Result<RunOutcome, AppError>>,
  ): { id: string; done: Promise<void> } {
    this.prune();
    const id = crypto.randomUUID();
    const abort = new AbortController();
    const entry: Entry = {
      state: { status: "running", boardId, kind, startedAt: Date.now() },
      abort,
    };
    this.runs.set(id, entry);
    const done = work(abort.signal)
      .then((r) => {
        if (abort.signal.aborted) entry.state = { status: "stopped", boardId, kind };
        else if (r.ok) entry.state = { status: "done", boardId, kind, outcome: r.value };
        else entry.state = { status: "failed", boardId, kind, error: r.error.message };
      })
      .catch(() => {
        entry.state = {
          status: "failed",
          boardId,
          kind,
          error: "Something went wrong while Claude was drawing. Try again.",
        };
      })
      .finally(() => {
        entry.finishedAt = Date.now();
      });
    return { id, done };
  }

  read(id: string): RunState | null {
    return this.runs.get(id)?.state ?? null;
  }

  /** The run still going on a board, if any (so a reopened panel shows "Generating"). */
  runningOn(boardId: string): { id: string; kind: RunKind } | null {
    for (const [id, e] of this.runs) {
      if (e.state.status === "running" && e.state.boardId === boardId) {
        return { id, kind: e.state.kind };
      }
    }
    return null;
  }

  stop(id: string): void {
    const e = this.runs.get(id);
    if (e?.state.status === "running") e.abort.abort();
  }

  private prune() {
    const now = Date.now();
    for (const [id, e] of this.runs) {
      if (e.finishedAt && now - e.finishedAt > KEEP_MS) this.runs.delete(id);
    }
  }
}

const KEY = Symbol.for("thoth.whiteboardRuns");
const store = globalThis as typeof globalThis & { [KEY]?: WhiteboardRuns };

/** Process-wide, on `globalThis` so a dev hot reload keeps running runs. */
export function whiteboardRuns(): WhiteboardRuns {
  store[KEY] ??= new WhiteboardRuns();
  return store[KEY];
}
