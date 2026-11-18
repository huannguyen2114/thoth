import { describe, expect, it } from "vitest";
import { ingestFailure } from "../../ports/ingest";
import { err, ok } from "../../shared/result";
import { addContent } from "./add-content";
import { FakeLlm, FakeParser, makeDeps } from "./fakes.test-support";
import { MAX_ATTEMPTS, processNextJob, RETRY_DELAYS_MS, runIngestJob } from "./run-ingest-job";

const T0 = new Date("2026-11-15T10:00:00Z");
const at = (ms: number) => () => new Date(T0.getTime() + ms);

async function addLink(d: ReturnType<typeof makeDeps>, url = "https://youtu.be/dQw4w9WgXcQ") {
  const r = await addContent(d, { kind: "link", url });
  if (!r.ok) throw new Error("setup");
  return r.value;
}

describe("processNextJob (happy path)", () => {
  it("parses, saves segments and chapters, sets the title and marks ready", async () => {
    const parser = new FakeParser(() =>
      ok({
        title: "Cell biology 101",
        segments: [
          { idx: 0, text: "Cells.", locator: { type: "time", startSec: 0, endSec: 40 } },
          { idx: 1, text: "Division.", locator: { type: "time", startSec: 40, endSec: 90 } },
        ],
      }),
    );
    const d = makeDeps({ parser });
    const content = await addLink(d);

    expect(await processNextJob(d.ingest, at(0))).toBe("done");

    expect(parser.calls).toEqual([{ kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" }]);
    expect(d.contents.rows[0]).toMatchObject({
      id: content.id,
      status: "ready",
      error: null,
      title: "Cell biology 101",
    });
    expect(d.segments.rows).toHaveLength(2);
    expect(d.chapters.rows).toEqual([
      expect.objectContaining({
        contentId: content.id,
        title: "Intro",
        locator: { type: "time", startSec: 0, endSec: 90 },
      }),
    ]);
    expect(d.jobs.rows[0]?.status).toBe("done");
    // Ready content queues an embed signal (ADR-0029), which wakes the indexer.
    expect(d.jobs.rows[1]).toMatchObject({ kind: "embed", payload: { contentId: content.id } });
    let woken = 0;
    expect(await processNextJob({ ...d.ingest, onEmbedJob: () => woken++ }, at(0))).toBe("done");
    expect(woken).toBe(1);
    expect(d.jobs.rows[1]?.status).toBe("done");
    expect(await processNextJob(d.ingest, at(0))).toBe("idle");
  });

  it("passes pasted text and the PDF path to the parser", async () => {
    const d = makeDeps();
    await addContent(d, { kind: "text", text: "Pasted body" });
    await addContent(d, { kind: "pdf", filePath: "/u/a.pdf", fileName: "a.pdf" });
    await processNextJob(d.ingest, at(0));
    await processNextJob(d.ingest, at(0));
    expect(d.parser.calls).toEqual([
      { kind: "text", text: "Pasted body" },
      { kind: "pdf", filePath: "/u/a.pdf", fileName: "a.pdf" },
    ]);
  });
});

describe("processNextJob (failures)", () => {
  it("fails at once, with the parser's message, when retrying cannot help", async () => {
    const parser = new FakeParser(() =>
      err(ingestFailure("This video has no captions. Pick a video with captions.", false)),
    );
    const d = makeDeps({ parser });
    await addLink(d);
    expect(await processNextJob(d.ingest, at(0))).toBe("failed");
    expect(d.contents.rows[0]).toMatchObject({
      status: "failed",
      error: "This video has no captions. Pick a video with captions.",
    });
    expect(d.jobs.rows[0]?.status).toBe("failed");
    expect(d.chapters.rows).toHaveLength(0);
  });

  it("retries transient failures with backoff, then fails after the last attempt", async () => {
    const parser = new FakeParser(() => err(ingestFailure("We could not reach YouTube.", true)));
    const d = makeDeps({ parser });
    await addLink(d);

    expect(await processNextJob(d.ingest, at(0))).toBe("retry");
    expect(d.contents.rows[0]).toMatchObject({
      status: "processing",
      error: "We could not reach YouTube. Trying again shortly.",
    });
    // Not runnable before the backoff ends.
    expect(await processNextJob(d.ingest, at(RETRY_DELAYS_MS[0] - 1))).toBe("idle");
    expect(await processNextJob(d.ingest, at(RETRY_DELAYS_MS[0]))).toBe("retry");
    expect(await processNextJob(d.ingest, at(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[1]))).toBe(
      "failed",
    );

    expect(parser.calls).toHaveLength(MAX_ATTEMPTS);
    expect(d.jobs.rows[0]).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(d.contents.rows[0]).toMatchObject({
      status: "failed",
      error: "We could not reach YouTube.",
    });
  });

  it("explains an unreachable model and keeps the segments", async () => {
    const llm = new FakeLlm(() => ({
      code: "llm_unavailable",
      message: "Run claude, then /login.",
    }));
    const d = makeDeps({ llm });
    await addLink(d);
    for (const ms of [0, 15_000, 75_000]) await processNextJob(d.ingest, at(ms));
    expect(d.contents.rows[0]?.status).toBe("failed");
    expect(d.contents.rows[0]?.error).toBe(
      "We could not reach the model to write chapters. Run claude, then /login.",
    );
    expect(d.segments.rows).toHaveLength(1);
  });

  it("treats a malformed model reply as retryable with a Settings hint", async () => {
    const d = makeDeps({ llm: new FakeLlm(() => ({ nope: true })) });
    const content = await addLink(d);
    const outcome = await runIngestJob(d.ingest, { contentId: content.id }, { isLast: true });
    expect(outcome.status).toBe("failed");
    expect(d.contents.rows[0]?.error).toMatch(/pick another model for Chapters in Settings/);
  });

  it("does not retry a refusal", async () => {
    const d = makeDeps({
      llm: new FakeLlm(() => ({ code: "llm_refused", message: "refused" })),
    });
    const content = await addLink(d);
    const outcome = await runIngestJob(d.ingest, { contentId: content.id }, { isLast: false });
    expect(outcome.status).toBe("failed");
  });

  it("records a thrown bug instead of leaving the content stuck", async () => {
    const parser = new FakeParser(() => {
      throw new Error("bug");
    });
    const d = makeDeps({ parser });
    await addLink(d);
    expect(await processNextJob(d.ingest, at(0))).toBe("retry");
    expect(d.contents.rows[0]?.status).toBe("processing");
    expect(d.jobs.rows[0]?.error).toContain("bug");
  });

  it("drops jobs with an unknown payload", async () => {
    const d = makeDeps();
    await d.jobs.enqueue("ingest", { wrong: 1 });
    expect(await processNextJob(d.ingest, at(0))).toBe("failed");
    expect(d.jobs.rows[0]?.status).toBe("failed");
  });
});

describe("retrying pasted text", () => {
  it("re-uses saved segments when the payload no longer has the text", async () => {
    const d = makeDeps({ llm: new FakeLlm(() => ({ code: "llm_refused", message: "no" })) });
    const r = await addContent(d, { kind: "text", text: "Body" });
    if (!r.ok) throw new Error("setup");
    await processNextJob(d.ingest, at(0));
    expect(d.contents.rows[0]?.status).toBe("failed");

    d.llmFake.reply = () => ({ chapters: [{ startSegment: 0, title: "T", summary: "S" }] });
    const outcome = await runIngestJob(d.ingest, { contentId: r.value.id }, { isLast: true });
    expect(outcome.status).toBe("ready");
    expect(d.parser.calls).toHaveLength(1);
  });

  it("asks to paste again when nothing was saved", async () => {
    const d = makeDeps();
    const r = await addContent(d, { kind: "text", text: "Body" });
    if (!r.ok) throw new Error("setup");
    const outcome = await runIngestJob(d.ingest, { contentId: r.value.id }, { isLast: false });
    expect(outcome).toEqual({
      status: "failed",
      message: "The pasted text was not saved. Paste it again.",
    });
  });
});
