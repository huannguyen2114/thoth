import "server-only";
import { embedMissingSegments } from "@thoth/core";
import { getContainer } from "../container";

/**
 * Background search index (ADR-0029). One loop per server process embeds every segment that
 * has no vector yet, a batch at a time, then sleeps until woken by an `embed` job or a
 * Rebuild. It runs beside the job runner, not inside it, so a slow first model download never
 * holds up ingestion: contents are `ready` before their vectors exist.
 */
const IDLE_MS = 10 * 60_000;
/** After a model failure (for example offline on first use), wait before trying again. */
const FAILURE_PAUSE_MS = 5 * 60_000;

export interface IndexerStatus {
  running: boolean;
  /** The model's last error message, cleared by the next successful batch. */
  lastError: string | null;
  /** Passages embedded since the server started, and how fast (for the docs' numbers). */
  embedded: number;
  passagesPerSecond: number | null;
}

interface IndexerState {
  started: boolean;
  wake: (() => void) | null;
  status: IndexerStatus;
  busyMs: number;
}

const globalKey = Symbol.for("thoth.indexer");
const state: IndexerState = ((globalThis as Record<symbol, unknown>)[globalKey] as
  | IndexerState
  | undefined) ?? {
  started: false,
  wake: null,
  status: { running: false, lastError: null, embedded: 0, passagesPerSecond: null },
  busyMs: 0,
};
(globalThis as Record<symbol, unknown>)[globalKey] = state;

/** Starts the loop once; its first pass is the backfill of existing contents. */
export function startIndexer(): void {
  if (state.started) return;
  state.started = true;
  void loop();
}

/** Ends the current wait so new segments are embedded now. */
export function wakeIndexer(): void {
  state.wake?.();
}

export function indexerStatus(): IndexerStatus {
  return { ...state.status };
}

async function loop(): Promise<void> {
  const c = await getContainer();
  const embeddings = c.embeddings;
  if (!embeddings) return;
  for (;;) {
    let pause = IDLE_MS;
    try {
      state.status.running = true;
      const t0 = performance.now();
      const step = await embedMissingSegments({ vectors: c.vectors, embeddings });
      if (!step.ok) {
        state.status.lastError = step.error.message;
        console.warn(`[index] ${step.error.message}`);
        pause = FAILURE_PAUSE_MS;
      } else {
        state.status.lastError = null;
        if (step.value.embedded > 0) {
          state.busyMs += performance.now() - t0;
          state.status.embedded += step.value.embedded;
          state.status.passagesPerSecond = state.status.embedded / (state.busyMs / 1000);
        }
        if (step.value.more) {
          // Yield so requests and the job runner get a turn between batches.
          await new Promise((r) => setImmediate(r));
          continue;
        }
        if (state.status.embedded > 0 && step.value.embedded > 0) {
          console.info(
            `[index] up to date: ${state.status.embedded} passage(s) embedded, ${state.status.passagesPerSecond?.toFixed(1)}/s`,
          );
        }
      }
    } catch (e) {
      // A DB fault, not a model one: log and retry later.
      console.error("[index] indexer error", e);
      pause = FAILURE_PAUSE_MS;
    }
    state.status.running = false;
    await sleep(pause);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      state.wake = null;
      resolve();
    }
    state.wake = done;
  });
}
