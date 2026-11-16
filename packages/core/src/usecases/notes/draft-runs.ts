import type { ContentId } from "../../shared/id";
import type { NotesDraftEvent } from "./notes";

export type NotesDraftStatus = "running" | "done" | "failed" | "cancelled";

/** What the editor reads while it polls a draft: the text it has not seen yet, and the status. */
export interface NotesDraftSnapshot {
  status: NotesDraftStatus;
  /** Text from the `from` offset the reader passed. */
  text: string;
  /** Total characters drafted so far. The next read passes this as `from`. */
  length: number;
  error: string | null;
}

interface Run {
  contentId: ContentId;
  text: string;
  status: NotesDraftStatus;
  error: string | null;
  abort: AbortController;
  lastReadAt: number;
  endedAt: number | null;
}

export interface NotesDraftRunsOptions {
  now?: () => number;
  newId?: () => string;
  /** A running draft nobody has read for this long is cancelled (the tab was closed). */
  abandonAfterMs?: number;
  /** A finished draft is forgotten this long after it ended. */
  keepFinishedMs?: number;
}

/**
 * In-memory registry of streamed notes drafts (ADR-0022, doc 12).
 *
 * Server Actions are dispatched one at a time per client and cannot stream, so the web app
 * starts a draft (consuming the events in the background), and the editor polls `read()` for
 * the new text. Single user, one process (ADR-0002): memory is enough, and nothing is saved
 * here. The editor applies the text and autosave stores it through `saveNote`.
 */
export class NotesDraftRuns {
  private readonly runs = new Map<string, Run>();
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly abandonAfterMs: number;
  private readonly keepFinishedMs: number;

  constructor(options: NotesDraftRunsOptions = {}) {
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? (() => globalThis.crypto.randomUUID());
    this.abandonAfterMs = options.abandonAfterMs ?? 30_000;
    this.keepFinishedMs = options.keepFinishedMs ?? 10 * 60_000;
  }

  /**
   * Registers a draft and starts consuming `events` at once. `abort` is the controller whose
   * signal was given to the model, so `cancel()` stops Claude, not only the reading.
   * `done` settles when the draft ends; it never rejects.
   */
  start(
    contentId: ContentId,
    events: AsyncIterable<NotesDraftEvent>,
    abort: AbortController,
  ): { id: string; done: Promise<void> } {
    this.sweep();
    const id = this.newId();
    const run: Run = {
      contentId,
      text: "",
      status: "running",
      error: null,
      abort,
      lastReadAt: this.now(),
      endedAt: null,
    };
    this.runs.set(id, run);
    return { id, done: this.consume(run, events) };
  }

  /** The text after `from` and the status, or null for an unknown or expired draft. */
  read(id: string, from = 0): NotesDraftSnapshot | null {
    const run = this.runs.get(id);
    if (!run) return null;
    run.lastReadAt = this.now();
    const start = Math.max(0, Math.min(from, run.text.length));
    return {
      status: run.status,
      text: run.text.slice(start),
      length: run.text.length,
      error: run.error,
    };
  }

  /** Stops a running draft and keeps what it wrote. False when it was not running. */
  cancel(id: string): boolean {
    const run = this.runs.get(id);
    if (run?.status !== "running") return false;
    this.end(run, "cancelled", null);
    run.abort.abort();
    return true;
  }

  /** Running drafts, for tests and diagnostics. */
  get running(): number {
    return [...this.runs.values()].filter((r) => r.status === "running").length;
  }

  private async consume(run: Run, events: AsyncIterable<NotesDraftEvent>): Promise<void> {
    try {
      for await (const e of events) {
        if (run.status !== "running") break;
        if (this.now() - run.lastReadAt > this.abandonAfterMs) {
          this.end(run, "cancelled", null);
          run.abort.abort();
          break;
        }
        if (e.type === "text") run.text += e.delta;
        else if (e.type === "error") this.end(run, "failed", e.message);
        else this.end(run, "done", null);
      }
      if (run.status === "running") this.end(run, "done", null);
    } catch {
      // An aborted provider may throw; a cancel already set the status.
      if (run.status === "running") {
        this.end(run, "failed", "The draft stopped unexpectedly. Try again.");
      }
    }
  }

  private end(run: Run, status: Exclude<NotesDraftStatus, "running">, error: string | null) {
    run.status = status;
    run.error = error;
    run.endedAt = this.now();
  }

  private sweep() {
    const now = this.now();
    for (const [id, run] of this.runs) {
      if (run.endedAt !== null && now - run.endedAt > this.keepFinishedMs) this.runs.delete(id);
    }
  }
}
