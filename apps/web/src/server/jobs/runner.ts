import "server-only";
import { type IngestDeps, processNextJob } from "@thoth/core";
import { getContainer } from "../container";
import { startIndexer, wakeIndexer } from "./indexer";

/**
 * In-process job runner (ADR-0002: single user, no Redis).
 *
 * One loop per server process runs jobs one at a time. When the queue is empty it sleeps for
 * POLL_MS, or until `wakeJobRunner()` is called after a new job is queued. Retry and backoff
 * rules live in the core use case `processNextJob`.
 */
const POLL_MS = 2_000;
const ERROR_PAUSE_MS = 10_000;

interface RunnerState {
  started: boolean;
  wake: (() => void) | null;
}

// Survives dev hot reloads, which re-evaluate this module, so only one loop ever runs.
const globalKey = Symbol.for("thoth.jobRunner");
const state: RunnerState = ((globalThis as Record<symbol, unknown>)[globalKey] as
  | RunnerState
  | undefined) ?? { started: false, wake: null };
(globalThis as Record<symbol, unknown>)[globalKey] = state;

export function startJobRunner(): void {
  if (state.started) return;
  state.started = true;
  void loop();
  // The search index backfills existing contents, then follows `embed` jobs (ADR-0029).
  startIndexer();
}

/** Ends the current idle wait so a newly queued job starts right away. */
export function wakeJobRunner(): void {
  state.wake?.();
}

async function loop(): Promise<never> {
  // A job still `running` at boot was cut off by a crash or restart: give it another go.
  try {
    const requeued = await (await getContainer()).jobs.requeueRunning();
    if (requeued > 0) console.info(`[jobs] re-queued ${requeued} interrupted job(s)`);
  } catch (e) {
    console.error("[jobs] could not re-queue interrupted jobs", e);
  }
  for (;;) {
    try {
      const c = await getContainer();
      const deps: IngestDeps = { ...c, parser: c.ingest, llm: c.llm, onEmbedJob: wakeIndexer };
      const result = await processNextJob(deps);
      if (result !== "idle") {
        console.info(`[jobs] job ${result}`);
        continue;
      }
      await sleep(POLL_MS);
    } catch (e) {
      // processNextJob already records job failures; this is a DB or wiring fault.
      console.error("[jobs] runner error", e);
      await sleep(ERROR_PAUSE_MS);
    }
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
