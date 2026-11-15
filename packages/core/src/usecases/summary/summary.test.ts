import { describe, expect, it } from "vitest";
import {
  CONTENT_ID,
  contentRow,
  FakeContents,
  FakeLlm,
  FakeSegments,
  FakeStudySets,
  pageSegments,
  timeSegments,
} from "./fakes";
import { buildSourceContext, buildSummarySystem } from "./prompts";
import { parseTimeInput, selectSegments, sourceBounds } from "./ranges";
import {
  deleteSummary,
  generateSummary,
  listSummaries,
  STALE_GENERATING_MS,
  type SummaryDeps,
  startSummary,
} from "./summary";

function setup(
  opts: { llm?: FakeLlm; pages?: boolean; content?: ReturnType<typeof contentRow> | null } = {},
) {
  const studySets = new FakeStudySets();
  const llm = opts.llm ?? new FakeLlm();
  const deps: SummaryDeps = {
    contents: new FakeContents(opts.content === undefined ? contentRow() : opts.content),
    segments: new FakeSegments(opts.pages ? pageSegments() : timeSegments()),
    studySets,
    llm: async () => llm,
    flushIntervalMs: 0,
  };
  return { deps, studySets, llm };
}

describe("selectSegments", () => {
  it("returns the whole source when there are no ranges", () => {
    expect(selectSegments(timeSegments(), [])).toHaveLength(5);
  });

  it("keeps time segments that overlap the range, including ones that straddle its edges", () => {
    // 01:46 to 28:22 is 106..1702 seconds
    const got = selectSegments(timeSegments(), [{ type: "time", startSec: 106, endSec: 1702 }]);
    expect(got.map((s) => s.text)).toEqual(["Core idea", "Case study"]);
    const straddle = selectSegments(timeSegments(), [{ type: "time", startSec: 100, endSec: 110 }]);
    expect(straddle.map((s) => s.text)).toEqual(["Setup", "Core idea"]);
  });

  it("keeps pages inside an inclusive page range", () => {
    const got = selectSegments(pageSegments(), [{ type: "page", startPage: 3, endPage: 5 }]);
    expect(got.map((s) => s.locator)).toEqual([
      { type: "page", page: 3 },
      { type: "page", page: 4 },
      { type: "page", page: 5 },
    ]);
  });

  it("unions several ranges in reading order and ignores ranges of the wrong type", () => {
    const got = selectSegments(pageSegments(), [
      { type: "page", startPage: 5, endPage: 6 },
      { type: "page", startPage: 1, endPage: 1 },
      { type: "time", startSec: 0, endSec: 100 },
    ]);
    expect(got.map((s) => s.idx)).toEqual([0, 4, 5]);
  });
});

describe("sourceBounds and parseTimeInput", () => {
  it("reports duration for time sources and page count for page sources", () => {
    expect(sourceBounds(timeSegments())).toEqual({
      locatorType: "time",
      durationSec: 2000,
      pageCount: null,
    });
    expect(sourceBounds(pageSegments())).toEqual({
      locatorType: "page",
      durationSec: null,
      pageCount: 6,
    });
  });

  it("parses mm:ss, h:mm:ss and plain seconds, and rejects junk", () => {
    expect(parseTimeInput("01:46")).toBe(106);
    expect(parseTimeInput("1:02:03")).toBe(3723);
    expect(parseTimeInput(" 90 ")).toBe(90);
    expect(parseTimeInput("abc")).toBeNull();
    expect(parseTimeInput("1:2")).toBeNull();
  });
});

describe("prompts", () => {
  it("prefixes every segment with its citation token", () => {
    expect(buildSourceContext(timeSegments().slice(1, 3))).toBe(
      "[00:42] Setup\n\n[01:46] Core idea",
    );
    expect(buildSourceContext(pageSegments().slice(0, 2))).toBe(
      "[p.1] Page 1 text\n\n[p.2] Page 2 text",
    );
  });

  it("changes the instructions per template and adds language and the custom prompt", () => {
    const base = { language: "Vietnamese" };
    expect(buildSummarySystem({ ...base, template: "detailed" })).toContain("comprehensive");
    expect(buildSummarySystem({ ...base, template: "cheat_sheet" })).toContain("cheat sheet");
    expect(buildSummarySystem({ ...base, template: "short" })).toContain("at most 5 bullet");
    const custom = buildSummarySystem({
      ...base,
      template: "short",
      customPrompt: "focus on exams",
    });
    expect(custom).toContain("Write in Vietnamese.");
    expect(custom).toContain("focus on exams");
    expect(buildSummarySystem({ ...base, template: "short" })).not.toContain("also asked");
  });
});

describe("startSummary and generateSummary", () => {
  it("creates a generating set, then ends ready with the streamed markdown", async () => {
    const { deps, studySets, llm } = setup();
    const r = await generateSummary(deps, CONTENT_ID, { template: "detailed" });
    expect(r.ok).toBe(true);
    expect(studySets.history).toEqual(["generating", "ready"]);
    const set = studySets.rows[0];
    expect(set).toMatchObject({
      kind: "summary",
      status: "ready",
      body: "# Title\nA point [01:46].",
      title: "Detailed summary",
      contentId: CONTENT_ID,
      error: null,
    });
    expect(set?.options).toMatchObject({ template: "detailed", language: "English", ranges: [] });
    expect(llm.requests[0]?.task).toBe("summary");
  });

  it("sends only the ranged segments, with their tokens, to the model", async () => {
    const { deps, llm } = setup();
    const started = await startSummary(deps, CONTENT_ID, {
      template: "short",
      ranges: [{ type: "time", startSec: 106, endSec: 1702 }],
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.set.title).toBe("Short summary · 01:46–28:22");
    expect(started.value.set.status).toBe("generating");
    await started.value.run();
    const ctx = llm.requests[0]?.context ?? "";
    expect(ctx).toContain("[01:46] Core idea");
    expect(ctx).toContain("[10:00] Case study");
    expect(ctx).not.toContain("Intro");
    expect(ctx).not.toContain("Wrap up");
  });

  it("limits a PDF to pages 3-5", async () => {
    const { deps, llm } = setup({ pages: true });
    await generateSummary(deps, CONTENT_ID, {
      template: "cheat_sheet",
      ranges: [{ type: "page", startPage: 3, endPage: 5 }],
    });
    const ctx = llm.requests[0]?.context ?? "";
    expect(ctx).toBe("[p.3] Page 3 text\n\n[p.4] Page 4 text\n\n[p.5] Page 5 text");
  });

  it("rejects a range that selects nothing, without creating a set", async () => {
    const { deps, studySets } = setup();
    const r = await startSummary(deps, CONTENT_ID, {
      template: "short",
      ranges: [{ type: "time", startSec: 5000, endSec: 6000 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation");
    expect(studySets.rows).toHaveLength(0);
  });

  it("rejects bad options, a missing content and unfinished content", async () => {
    const bad = await startSummary(setup().deps, CONTENT_ID, { template: "nope" as never });
    expect(bad.ok === false && bad.error.code).toBe("validation");
    const reversed = await startSummary(setup().deps, CONTENT_ID, {
      template: "short",
      ranges: [{ type: "time", startSec: 50, endSec: 10 }],
    });
    expect(reversed.ok === false && reversed.error.message).toMatch(/end after it starts/);
    const missing = await startSummary(setup({ content: null }).deps, CONTENT_ID, {
      template: "short",
    });
    expect(missing.ok === false && missing.error.code).toBe("not_found");
    const pending = await startSummary(
      setup({ content: contentRow("processing") }).deps,
      CONTENT_ID,
      {
        template: "short",
      },
    );
    expect(pending.ok === false && pending.error.code).toBe("validation");
  });

  it("marks the set failed with the model's error and keeps the partial text", async () => {
    const llm = new FakeLlm(["Half a sum"], "Claude is not signed in.");
    const { deps, studySets } = setup({ llm });
    await generateSummary(deps, CONTENT_ID, { template: "short" });
    expect(studySets.history).toEqual(["generating", "failed"]);
    expect(studySets.rows[0]).toMatchObject({
      status: "failed",
      error: "Claude is not signed in.",
      body: "Half a sum",
    });
  });

  it("marks the set failed when the provider throws or replies with nothing", async () => {
    const throwing = setup();
    throwing.deps.llm = async () => {
      throw new Error("spawn failed");
    };
    await generateSummary(throwing.deps, CONTENT_ID, { template: "short" });
    expect(throwing.studySets.rows[0]).toMatchObject({ status: "failed", error: "spawn failed" });

    const empty = setup({ llm: new FakeLlm(["  "]) });
    await generateSummary(empty.deps, CONTENT_ID, { template: "short" });
    expect(empty.studySets.rows[0]?.status).toBe("failed");
  });

  it("saves partial text while streaming so the panel can show progress", async () => {
    const { deps, studySets } = setup({ llm: new FakeLlm(["one ", "two ", "three"]) });
    const started = await startSummary(deps, CONTENT_ID, { template: "short" });
    if (!started.ok) throw new Error("setup");
    const bodies: (string | null)[] = [];
    const original = studySets.update.bind(studySets);
    studySets.update = async (id, patch) => {
      if (patch.body !== undefined) bodies.push(patch.body);
      return original(id, patch);
    };
    await started.value.run();
    expect(bodies).toEqual(["one ", "one two ", "one two three", "one two three"]);
  });
});

describe("listSummaries and deleteSummary", () => {
  it("lists newest first and turns long-stuck generating sets into failed", async () => {
    const { deps, studySets } = setup();
    const a = await studySets.create({
      kind: "summary",
      contentId: CONTENT_ID,
      spaceId: null,
      title: "A",
      options: {},
      status: "ready",
    });
    const b = await studySets.create({
      kind: "summary",
      contentId: CONTENT_ID,
      spaceId: null,
      title: "B",
      options: {},
      status: "generating",
    });
    a.createdAt = new Date(1000);
    b.createdAt = new Date(2000);
    b.updatedAt = new Date(2000);
    const later = () => new Date(2000 + STALE_GENERATING_MS + 1);
    const list = await listSummaries({ studySets, now: later }, CONTENT_ID);
    expect(list.map((s) => s.title)).toEqual(["B", "A"]);
    expect(list[0]?.status).toBe("failed");
    expect(studySets.rows.find((r) => r.id === b.id)?.status).toBe("failed");
    expect(deps).toBeDefined();
  });

  it("deletes a summary of this content and refuses anything else", async () => {
    const { studySets } = setup();
    const s = await studySets.create({
      kind: "summary",
      contentId: CONTENT_ID,
      spaceId: null,
      title: "A",
      options: {},
      status: "ready",
    });
    const quiz = await studySets.create({
      kind: "quiz",
      contentId: CONTENT_ID,
      spaceId: null,
      title: "Q",
      options: {},
      status: "ready",
    });
    expect((await deleteSummary({ studySets }, CONTENT_ID, quiz.id)).ok).toBe(false);
    expect((await deleteSummary({ studySets }, "other" as typeof CONTENT_ID, s.id)).ok).toBe(false);
    expect((await deleteSummary({ studySets }, CONTENT_ID, s.id)).ok).toBe(true);
    expect(studySets.rows.map((r) => r.id)).toEqual([quiz.id]);
  });
});
