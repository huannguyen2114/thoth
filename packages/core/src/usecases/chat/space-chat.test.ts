import { describe, expect, it } from "vitest";
import { parseLinks } from "../../domain/link";
import type { ContentId } from "../../shared/id";
import { page, para, StreamLlm, world } from "../spaces/fakes.test-support";
import type { ChatTurnEvent } from "./chat";
import { startSpaceChatTurn } from "./space-chat";
import { linkSpaceCitations, type SpaceSource } from "./space-chat-citations";
import { buildSpaceChatContext } from "./space-chat-context";
import { SPACE_CHAT_PROMPT_START } from "./space-chat-prompts";

const sources: SpaceSource[] = [
  { label: "S1", contentId: "c1" as ContentId, title: "Lecture [one]", kind: "youtube" },
  { label: "S2", contentId: "c2" as ContentId, title: "Book", kind: "pdf" },
  { label: "S3", contentId: "c3" as ContentId, title: "Notes", kind: "text" },
];

describe("linkSpaceCitations", () => {
  it("turns [Sn place] citations into thoth: links with the title and place", () => {
    const out = linkSpaceCitations("Cells divide. [S2 p.3] Then [S1 03:21] and [S3 §2].", sources);
    expect(out).toBe(
      "Cells divide. [Book · p.3](thoth:c/c2?at=p.3) Then [Lecture one · 03:21](thoth:c/c1?at=t.201) and [Notes · §2](thoth:c/c3?at=par.2).",
    );
    const links = parseLinks(out);
    expect(links.map((l) => l.anchor)).toEqual([
      { kind: "content", contentId: "c2", locator: { type: "page", page: 3 } },
      { kind: "content", contentId: "c1", locator: { type: "time", startSec: 201, endSec: 201 } },
      {
        kind: "content",
        contentId: "c3",
        locator: { type: "offset", start: 0, end: 0, paragraph: 2 },
      },
    ]);
  });

  it("handles a whole source, lists, loose spellings and unknown sources", () => {
    expect(linkSpaceCitations("See [S2].", sources)).toBe("See [Book](thoth:c/c2).");
    expect(linkSpaceCitations("[S1 p.2; S2 page 4]", sources)).toBe(
      "[Lecture one · p.2](thoth:c/c1?at=p.2) [Book · p.4](thoth:c/c2?at=p.4)",
    );
    expect(linkSpaceCitations("[S2, p 7]", sources)).toBe("[Book · p.7](thoth:c/c2?at=p.7)");
    expect(linkSpaceCitations("Gone [S9 p.1].", sources)).toBe("Gone .");
    expect(linkSpaceCitations("[S2 somewhere]", sources)).toBe("[Book](thoth:c/c2)");
  });

  it("leaves text that is not a citation, and links already made, alone", () => {
    const done = "[Book · p.3](thoth:c/c2?at=p.3)";
    expect(linkSpaceCitations(`${done} [see below] [p.3]`, sources)).toBe(
      `${done} [see below] [p.3]`,
    );
  });
});

async function space(w: ReturnType<typeof world>) {
  const s = await w.spaces.create({ name: "Bio", description: null, color: null, icon: null });
  const a = w.contents.add("Cells", { spaceId: s.id });
  const b = w.contents.add("Genetics", { spaceId: s.id, kind: "pdf" });
  w.contents.add("Still processing", { spaceId: s.id, status: "processing" });
  w.contents.add("Elsewhere");
  w.segments.add(a.id, ["Cells divide by mitosis.", "Membranes keep cells whole."], para);
  w.segments.add(b.id, ["Genes are made of DNA.", "Mitosis copies every gene."], page);
  return { s, a, b };
}

async function drain(events: AsyncIterable<ChatTurnEvent>) {
  const out: ChatTurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("buildSpaceChatContext", () => {
  it("includes every ready content whole when the space is small, labelled S1..Sn", async () => {
    const w = world();
    const { a, b } = await space(w);
    const ctx = await buildSpaceChatContext(w, [a, b], "mitosis");
    expect(ctx.mode).toBe("full");
    expect(ctx.sources.map((x) => [x.label, x.title])).toEqual([
      ["S1", "Cells"],
      ["S2", "Genetics"],
    ]);
    expect(ctx.text).toContain('<source id="S2" title="Genetics" kind="pdf">');
    expect(ctx.text).toContain("[p.2] Mitosis copies every gene.");
    expect(ctx.included).toBe(4);
  });

  it("caps passages per content and in total when the space is large", async () => {
    const w = world();
    const { a, b } = await space(w);
    w.segments.add(
      a.id,
      Array.from({ length: 30 }, (_, i) => `Mitosis detail ${i} about chromosomes.`),
      (i) => para(i + 2),
    );
    const ctx = await buildSpaceChatContext(w, [a, b], "mitosis chromosomes", {
      maxFullTokens: 10,
      perContentK: 3,
      totalK: 4,
    });
    expect(ctx.mode).toBe("search");
    const perSource = ctx.sources.map(
      (s) =>
        (ctx.text.split(`<source id="${s.label}"`)[1] ?? "").split("</source>")[0]?.match(/^\[/gm)
          ?.length,
    );
    expect(perSource.every((n) => (n ?? 0) <= 3)).toBe(true);
    expect(ctx.included).toBeLessThanOrEqual(4);
    expect(ctx.sources.map((s) => s.title)).toEqual(["Cells", "Genetics"]);
  });
});

describe("startSpaceChatTurn", () => {
  it("answers across the space, saves thoth: links and indexes them as backlinks", async () => {
    const w = world();
    const { s, a, b } = await space(w);
    const llm = new StreamLlm(() => "Cells divide [S1 §1]. Genes copy too [S2 p.2].");
    const r = await startSpaceChatTurn(
      { ...w, llm },
      { spaceId: s.id, text: "How do cells divide?" },
    );
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.chat).toMatchObject({ spaceId: s.id, contentId: null });
    expect(r.value.context.sources.map((x) => x.contentId)).toEqual([a.id, b.id]);
    const events = await drain(r.value.events);
    const saved = events.at(-1);
    if (saved?.type !== "saved") throw new Error("not saved");
    expect(saved.message.text).toBe(
      `Cells divide [Cells · §1](thoth:c/${a.id}?at=par.1). Genes copy too [Genetics · p.2](thoth:c/${b.id}?at=p.2).`,
    );
    expect(saved.message.citations).toEqual([]);
    expect(w.links.rows.map((l) => [l.fromKind, l.fromId, l.fromSpaceId, l.label])).toEqual([
      ["chat_message", saved.message.id, s.id, "Cells · §1"],
      ["chat_message", saved.message.id, s.id, "Genetics · p.2"],
    ]);
    expect(w.activity.events.map((e) => e.kind)).toEqual(["chat_question"]);
    const req = llm.requests[0];
    expect(req?.system.startsWith(SPACE_CHAT_PROMPT_START)).toBe(true);
    expect(req?.context).toContain('<source id="S1" title="Cells"');
    expect(req?.context).not.toContain("Still processing");
  });

  it("continues a chat of this space and refuses one from elsewhere", async () => {
    const w = world();
    const { s } = await space(w);
    const llm = new StreamLlm(() => "Yes [S1 §2].");
    const first = await startSpaceChatTurn({ ...w, llm }, { spaceId: s.id, text: "One" });
    if (!first.ok) throw new Error("setup");
    await drain(first.value.events);
    const again = await startSpaceChatTurn(
      { ...w, llm },
      { spaceId: s.id, chatId: first.value.chat.id, text: "Two" },
    );
    expect(again.ok && again.value.chat.id).toBe(first.value.chat.id);
    const other = await w.spaces.create({ name: "X", description: null, color: null, icon: null });
    w.contents.add("x", { spaceId: other.id });
    const wrong = await startSpaceChatTurn(
      { ...w, llm },
      { spaceId: other.id, chatId: first.value.chat.id, text: "Three" },
    );
    expect(!wrong.ok && wrong.error.code).toBe("not_found");
  });

  it("explains an empty space and an empty question", async () => {
    const w = world();
    const s = await w.spaces.create({ name: "E", description: null, color: null, icon: null });
    const llm = new StreamLlm(() => "");
    const empty = await startSpaceChatTurn({ ...w, llm }, { spaceId: s.id, text: "Hi" });
    expect(!empty.ok && empty.error.message).toMatch(/Add a content/);
    const blank = await startSpaceChatTurn({ ...w, llm }, { spaceId: s.id, text: "  " });
    expect(!blank.ok && blank.error.code).toBe("validation");
  });
});
