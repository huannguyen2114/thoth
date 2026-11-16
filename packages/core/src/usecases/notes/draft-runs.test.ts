import { describe, expect, it } from "vitest";
import type { LlmProvider, LlmRequest, LlmStreamEvent } from "../../ports/llm";
import {
  CONTENT_ID,
  contentRow,
  FakeContents,
  FakeLlm,
  FakeNotes,
  FakeSegments,
  pageSegments,
} from "../summary/fakes";
import { NotesDraftRuns } from "./draft-runs";
import { type NotesDeps, type NotesDraftEvent, streamNotesDraft } from "./notes";

function deps(llm: LlmProvider, content = contentRow()): NotesDeps {
  return {
    contents: new FakeContents(content),
    segments: new FakeSegments(pageSegments()),
    notes: new FakeNotes(),
    llm: async () => llm,
  };
}

async function collect(events: AsyncIterable<NotesDraftEvent>): Promise<NotesDraftEvent[]> {
  const out: NotesDraftEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** A model that yields one chunk per `release()`, and stops when the request is aborted. */
class GatedLlm extends FakeLlm {
  private waiters: (() => void)[] = [];
  release() {
    this.waiters.shift()?.();
  }
  override async *streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    this.requests.push(req);
    for (const delta of ["# One\n", "- two [p.2]\n", "- three\n"]) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        req.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      if (req.signal?.aborted) return;
      yield { type: "text", delta };
    }
    yield { type: "done" };
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("streamNotesDraft", () => {
  it("validates before streaming and passes the abort signal to the model", async () => {
    const llm = new FakeLlm(["# Notes\n", "", "- a point [p.2]"]);
    const abort = new AbortController();
    const r = await streamNotesDraft(deps(llm), CONTENT_ID, {
      language: "French",
      signal: abort.signal,
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(await collect(r.value)).toEqual([
      { type: "text", delta: "# Notes\n" },
      { type: "text", delta: "- a point [p.2]" },
      { type: "done" },
    ]);
    expect(llm.requests[0]?.signal).toBe(abort.signal);
    expect(llm.requests[0]?.system).toContain("Write in French.");
    expect(llm.requests[0]?.context).toContain("[p.6] Page 6 text");

    const missing = await streamNotesDraft(deps(llm, null as never), CONTENT_ID);
    expect(missing.ok === false && missing.error.code).toBe("not_found");
    const busy = await streamNotesDraft(deps(llm, contentRow("processing")), CONTENT_ID);
    expect(busy.ok === false && busy.error.code).toBe("validation");
  });

  it("turns an empty reply or a model error into one error event", async () => {
    const empty = await streamNotesDraft(deps(new FakeLlm(["  "])), CONTENT_ID);
    if (!empty.ok) throw new Error("expected ok");
    expect(await collect(empty.value)).toEqual([
      { type: "text", delta: "  " },
      { type: "error", message: "Claude returned empty notes. Try again." },
    ]);
    const failing = await streamNotesDraft(deps(new FakeLlm(["# Half"], "boom")), CONTENT_ID);
    if (!failing.ok) throw new Error("expected ok");
    expect((await collect(failing.value)).at(-1)).toEqual({ type: "error", message: "boom" });
  });
});

describe("NotesDraftRuns", () => {
  it("accumulates text that a reader polls from an offset, then reports done", async () => {
    const runs = new NotesDraftRuns({ newId: () => "d1" });
    const r = await streamNotesDraft(deps(new FakeLlm(["# A\n", "- b [p.2]"])), CONTENT_ID);
    if (!r.ok) throw new Error("expected ok");
    const { id, done } = runs.start(CONTENT_ID, r.value, new AbortController());
    await done;
    expect(runs.read(id)).toEqual({
      status: "done",
      text: "# A\n- b [p.2]",
      length: 13,
      error: null,
    });
    expect(runs.read(id, 4)?.text).toBe("- b [p.2]");
    expect(runs.read(id, 99)?.text).toBe("");
    expect(runs.read("nope")).toBeNull();
  });

  it("streams: a read mid-draft sees only what was written so far", async () => {
    const llm = new GatedLlm();
    const abort = new AbortController();
    const r = await streamNotesDraft(deps(llm), CONTENT_ID, { signal: abort.signal });
    if (!r.ok) throw new Error("expected ok");
    const runs = new NotesDraftRuns();
    const { id, done } = runs.start(CONTENT_ID, r.value, abort);
    await tick();
    llm.release();
    await tick();
    expect(runs.read(id)).toMatchObject({ status: "running", text: "# One\n" });
    llm.release();
    await tick();
    llm.release();
    await done;
    expect(runs.read(id, 6)).toMatchObject({ status: "done", text: "- two [p.2]\n- three\n" });
  });

  it("cancel aborts the model and keeps the partial text", async () => {
    const llm = new GatedLlm();
    const abort = new AbortController();
    const r = await streamNotesDraft(deps(llm), CONTENT_ID, { signal: abort.signal });
    if (!r.ok) throw new Error("expected ok");
    const runs = new NotesDraftRuns();
    const { id, done } = runs.start(CONTENT_ID, r.value, abort);
    await tick();
    llm.release();
    await tick();
    expect(runs.cancel(id)).toBe(true);
    expect(abort.signal.aborted).toBe(true);
    await done;
    expect(runs.read(id)).toMatchObject({ status: "cancelled", text: "# One\n", error: null });
    expect(runs.cancel(id)).toBe(false);
    expect(runs.running).toBe(0);
  });

  it("records a model error as failed, keeping the partial text", async () => {
    const r = await streamNotesDraft(deps(new FakeLlm(["# Half"], "Rate limited")), CONTENT_ID);
    if (!r.ok) throw new Error("expected ok");
    const runs = new NotesDraftRuns();
    const { id, done } = runs.start(CONTENT_ID, r.value, new AbortController());
    await done;
    expect(runs.read(id)).toEqual({
      status: "failed",
      text: "# Half",
      length: 6,
      error: "Rate limited",
    });
  });

  it("cancels a draft nobody reads any more, and forgets finished drafts later", async () => {
    let now = 0;
    const llm = new GatedLlm();
    const abort = new AbortController();
    const r = await streamNotesDraft(deps(llm), CONTENT_ID, { signal: abort.signal });
    if (!r.ok) throw new Error("expected ok");
    const runs = new NotesDraftRuns({
      now: () => now,
      abandonAfterMs: 1000,
      keepFinishedMs: 5000,
    });
    const { id, done } = runs.start(CONTENT_ID, r.value, abort);
    await tick();
    now = 2000; // the tab was closed: no read for 2 s
    llm.release();
    await done;
    expect(abort.signal.aborted).toBe(true);
    expect(runs.read(id)?.status).toBe("cancelled");

    now = 10_000;
    const again = await streamNotesDraft(deps(new FakeLlm()), CONTENT_ID);
    if (!again.ok) throw new Error("expected ok");
    await runs.start(CONTENT_ID, again.value, new AbortController()).done;
    expect(runs.read(id)).toBeNull();
  });

  it("marks a draft failed when the provider throws", async () => {
    async function* broken(): AsyncIterable<NotesDraftEvent> {
      yield { type: "text", delta: "# A" };
      throw new Error("socket closed");
    }
    const runs = new NotesDraftRuns();
    const { id, done } = runs.start(CONTENT_ID, broken(), new AbortController());
    await done;
    expect(runs.read(id)).toMatchObject({
      status: "failed",
      text: "# A",
      error: "The draft stopped unexpectedly. Try again.",
    });
  });
});
