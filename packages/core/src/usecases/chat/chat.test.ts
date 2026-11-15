import { describe, expect, it } from "vitest";
import type { Chat, ChatMessage } from "../../domain/chat";
import type { CitationRef } from "../../domain/citation";
import type {
  Content,
  ContentKind,
  ContentStatus,
  NewContent,
  NewSegment,
  Segment,
  SegmentHit,
} from "../../domain/content";
import type { LlmProvider, LlmRequest, LlmStreamEvent } from "../../ports/llm";
import type {
  ChatRepository,
  ContentRepository,
  SegmentRepository,
} from "../../ports/repositories";
import {
  type ChatId,
  type ContentId,
  type MessageId,
  newId,
  type SegmentId,
} from "../../shared/id";
import { ok } from "../../shared/result";
import {
  type ChatTurn,
  type ChatTurnEvent,
  getChatThread,
  setChatInstructions,
  startChatTurn,
  toLlmMessages,
} from "./chat";
import { buildChatContext, segmentToken, spreadEvenly } from "./context";
import { buildChatSystemPrompt, chatTitleFrom } from "./prompts";

// ---------- fakes ----------

class FakeContents implements ContentRepository {
  rows: Content[] = [];
  add(kind: ContentKind, status: ContentStatus = "ready"): Content {
    const now = new Date();
    const c: Content = {
      id: newId<ContentId>(),
      spaceId: null,
      kind,
      title: `Sample ${kind}`,
      sourceUrl: null,
      filePath: null,
      status,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(c);
    return c;
  }
  async create(_: NewContent): Promise<Content> {
    throw new Error("not used");
  }
  async get(id: ContentId) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listRecent() {
    return this.rows;
  }
  async listBySpace() {
    return [];
  }
  async setStatus() {}
  async setTitle() {}
  async setSpace() {}
}

class FakeSegments implements SegmentRepository {
  rows: Segment[] = [];
  searches: string[] = [];
  async replaceForContent(contentId: ContentId, items: NewSegment[]) {
    this.rows = [
      ...this.rows.filter((s) => s.contentId !== contentId),
      ...items.map((s) => ({ ...s, id: newId<SegmentId>(), contentId })),
    ];
  }
  async listByContent(contentId: ContentId) {
    return this.rows.filter((s) => s.contentId === contentId).sort((a, b) => a.idx - b.idx);
  }
  /** Naive search: segments containing any query word, by descending idx to test re-sorting. */
  async search(contentIds: ContentId[], query: string, limit: number): Promise<SegmentHit[]> {
    this.searches.push(query);
    const words = query.toLowerCase().match(/\p{L}{3,}/gu) ?? [];
    return this.rows
      .filter((s) => contentIds.includes(s.contentId))
      .filter((s) => words.some((w) => s.text.toLowerCase().includes(w)))
      .sort((a, b) => b.idx - a.idx)
      .slice(0, limit)
      .map((segment, rank) => ({ segment, rank }));
  }
}

class FakeChats implements ChatRepository {
  chats: Chat[] = [];
  messages: ChatMessage[] = [];
  private tick = 0;
  async create(contentId: ContentId, title: string) {
    const now = new Date(++this.tick);
    const chat: Chat = {
      id: newId<ChatId>(),
      contentId,
      title,
      instructions: null,
      createdAt: now,
      updatedAt: now,
    };
    this.chats.unshift(chat);
    return chat;
  }
  async get(id: ChatId) {
    return this.chats.find((c) => c.id === id) ?? null;
  }
  async listByContent(contentId: ContentId) {
    return this.chats.filter((c) => c.contentId === contentId);
  }
  async setInstructions(id: ChatId, instructions: string | null) {
    const c = this.chats.find((x) => x.id === id);
    if (c) c.instructions = instructions;
  }
  async addMessage(
    chatId: ChatId,
    role: ChatMessage["role"],
    text: string,
    citations: CitationRef[],
  ) {
    const m: ChatMessage = {
      id: newId<MessageId>(),
      chatId,
      role,
      text,
      citations,
      createdAt: new Date(++this.tick),
    };
    this.messages.push(m);
    return m;
  }
  async listMessages(chatId: ChatId) {
    return this.messages.filter((m) => m.chatId === chatId);
  }
}

/** Records every request and streams a scripted list of events. */
class ScriptedLlm implements LlmProvider {
  readonly id = "fake" as const;
  requests: LlmRequest[] = [];
  constructor(private readonly script: () => LlmStreamEvent[]) {}
  async generateText() {
    return ok("");
  }
  async *streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    this.requests.push(req);
    for (const e of this.script()) yield e;
  }
  async generateObject(): Promise<never> {
    throw new Error("not used");
  }
}

const reply = (text: string): (() => LlmStreamEvent[]) => {
  return () => [
    ...text.split(/(?<= )/).map((delta) => ({ type: "text" as const, delta })),
    { type: "done" as const },
  ];
};

const pdfPages = [
  "Glycolysis splits glucose in the cytoplasm.",
  "Mitochondria have an inner membrane called the cristae.",
  "The Krebs cycle loads NADH and FADH2.",
  "ATP synthase makes most of the ATP.",
  "Without oxygen, cells use fermentation.",
];

function setup(kind: ContentKind = "pdf", llmReply = "Mitochondria hold the cristae [p.2].") {
  const contents = new FakeContents();
  const segments = new FakeSegments();
  const chats = new FakeChats();
  const llm = new ScriptedLlm(reply(llmReply));
  const content = contents.add(kind);
  return { contents, segments, chats, llm, content, deps: { contents, segments, chats, llm } };
}

async function seedPdf(s: ReturnType<typeof setup>) {
  await s.segments.replaceForContent(
    s.content.id,
    pdfPages.map((text, i) => ({ idx: i, text, locator: { type: "page", page: i + 1 } })),
  );
}

async function drain(turn: ChatTurn): Promise<ChatTurnEvent[]> {
  const out: ChatTurnEvent[] = [];
  for await (const e of turn.events) out.push(e);
  return out;
}

// ---------- tests ----------

describe("startChatTurn", () => {
  it("sends every segment with its citation token when the source is small", async () => {
    const s = setup();
    await seedPdf(s);
    const r = await startChatTurn(s.deps, { contentId: s.content.id, text: "What are cristae?" });
    if (!r.ok) throw new Error(r.error.message);
    await drain(r.value);

    const req = s.llm.requests[0];
    expect(req?.task).toBe("chat");
    for (let page = 1; page <= pdfPages.length; page++) {
      expect(req?.context).toContain(`[p.${page}] ${pdfPages[page - 1]}`);
    }
    expect(req?.system).toContain("[p.N]");
    expect(r.value.context).toEqual({ mode: "full", included: 5, total: 5 });
    expect(s.segments.searches).toHaveLength(0);
  });

  it("uses clock tokens for a video and paragraph tokens for a web page", async () => {
    const video = setup("youtube");
    await video.segments.replaceForContent(video.content.id, [
      {
        idx: 0,
        text: "Welcome to the course.",
        locator: { type: "time", startSec: 0, endSec: 42 },
      },
      { idx: 1, text: "Brains adapt.", locator: { type: "time", startSec: 3723, endSec: 3800 } },
    ]);
    const vr = await startChatTurn(video.deps, { contentId: video.content.id, text: "Hi" });
    if (!vr.ok) throw new Error(vr.error.message);
    await drain(vr.value);
    expect(video.llm.requests[0]?.context).toContain("[00:00] Welcome to the course.");
    expect(video.llm.requests[0]?.context).toContain("[1:02:03] Brains adapt.");
    expect(video.llm.requests[0]?.system).toContain("[mm:ss]");

    const web = setup("webpage");
    await web.segments.replaceForContent(web.content.id, [
      { idx: 0, text: "First paragraph.", locator: { type: "offset", start: 0, end: 16 } },
      { idx: 1, text: "Second paragraph.", locator: { type: "offset", start: 17, end: 34 } },
    ]);
    const wr = await startChatTurn(web.deps, { contentId: web.content.id, text: "Hi" });
    if (!wr.ok) throw new Error(wr.error.message);
    await drain(wr.value);
    expect(web.llm.requests[0]?.context).toContain("[§1] First paragraph.");
    expect(web.llm.requests[0]?.context).toContain("[§2] Second paragraph.");
  });

  it("switches to FTS top-k excerpts when the source is too big", async () => {
    const s = setup();
    await seedPdf(s);
    const r = await startChatTurn(
      s.deps,
      { contentId: s.content.id, text: "mitochondria oxygen" },
      { context: { maxFullTokens: 10, topK: 3 } },
    );
    if (!r.ok) throw new Error(r.error.message);
    await drain(r.value);

    expect(s.segments.searches[0]).toContain("mitochondria");
    expect(r.value.context).toEqual({ mode: "search", included: 2, total: 5 });
    const ctx = s.llm.requests[0]?.context ?? "";
    expect(ctx).toContain("[p.2]");
    expect(ctx).toContain("[p.5]");
    expect(ctx).not.toContain("[p.1]");
    // Excerpts are back in source order even though search ranked p.5 first.
    expect(ctx.indexOf("[p.2]")).toBeLessThan(ctx.indexOf("[p.5]"));
    expect(s.llm.requests[0]?.system).toContain("only the passages that best match");
  });

  it("persists the question and the answer with parsed citations", async () => {
    const s = setup("pdf", "Cristae fold the membrane [p.2], and ATP synthase works there [p.4].");
    await seedPdf(s);
    const r = await startChatTurn(s.deps, {
      contentId: s.content.id,
      text: "  What are cristae? ",
    });
    if (!r.ok) throw new Error(r.error.message);
    const events = await drain(r.value);

    const text = events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("");
    expect(text).toContain("[p.4]");
    const saved = events.at(-1);
    expect(saved?.type).toBe("saved");

    expect(s.chats.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(s.chats.messages[0]?.text).toBe("What are cristae?");
    expect(s.chats.messages[1]?.citations).toEqual([
      { type: "page", page: 2 },
      { type: "page", page: 4 },
    ]);
    expect(r.value.chat.title).toBe("What are cristae?");
  });

  it("continues an existing chat and sends the earlier turns as history", async () => {
    const s = setup();
    await seedPdf(s);
    const first = await startChatTurn(s.deps, { contentId: s.content.id, text: "Q1 glycolysis" });
    if (!first.ok) throw new Error(first.error.message);
    await drain(first.value);

    const second = await startChatTurn(
      s.deps,
      { contentId: s.content.id, chatId: first.value.chat.id, text: "Q2" },
      { context: { maxFullTokens: 10, topK: 3 } },
    );
    if (!second.ok) throw new Error(second.error.message);
    await drain(second.value);

    expect(s.chats.chats).toHaveLength(1);
    expect(s.llm.requests[1]?.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    // A short follow-up still searches with the previous question's words.
    expect(s.segments.searches[0]).toContain("glycolysis");
  });

  it("applies chat instructions and copies them to the next new chat", async () => {
    const s = setup();
    await seedPdf(s);
    const first = await startChatTurn(s.deps, {
      contentId: s.content.id,
      text: "Hi",
      instructions: "Answer like a pirate.",
    });
    if (!first.ok) throw new Error(first.error.message);
    await drain(first.value);
    expect(s.llm.requests[0]?.system).toContain("<chat_instructions>\nAnswer like a pirate.");

    const second = await startChatTurn(s.deps, { contentId: s.content.id, text: "Hello again" });
    if (!second.ok) throw new Error(second.error.message);
    expect(second.value.chat.instructions).toBe("Answer like a pirate.");
  });

  it("reports a stream error and does not save an answer", async () => {
    const s = setup();
    await seedPdf(s);
    s.llm.requests = [];
    const llm = new ScriptedLlm(() => [
      { type: "text", delta: "Partial" },
      { type: "error", message: "Claude Code is not signed in." },
    ]);
    const r = await startChatTurn({ ...s.deps, llm }, { contentId: s.content.id, text: "Q" });
    if (!r.ok) throw new Error(r.error.message);
    const events = await drain(r.value);
    expect(events.at(-1)).toEqual({ type: "error", message: "Claude Code is not signed in." });
    expect(s.chats.messages.map((m) => m.role)).toEqual(["user"]);
  });

  it("returns errors before streaming for bad input, missing or unready content", async () => {
    const s = setup();
    await seedPdf(s);
    const empty = await startChatTurn(s.deps, { contentId: s.content.id, text: "   " });
    expect(!empty.ok && empty.error.code).toBe("validation");

    const missing = await startChatTurn(s.deps, { contentId: "nope", text: "Q" });
    expect(!missing.ok && missing.error.code).toBe("not_found");

    const pending = s.contents.add("pdf", "processing");
    const notReady = await startChatTurn(s.deps, { contentId: pending.id, text: "Q" });
    expect(!notReady.ok && notReady.error.code).toBe("validation");

    const otherChat = await s.chats.create(pending.id, "Other");
    const wrongChat = await startChatTurn(s.deps, {
      contentId: s.content.id,
      chatId: otherChat.id,
      text: "Q",
    });
    expect(!wrongChat.ok && wrongChat.error.code).toBe("not_found");

    const noText = setup();
    const r = await startChatTurn(noText.deps, { contentId: noText.content.id, text: "Q" });
    expect(!r.ok && r.error.message).toContain("no text");
    expect(noText.chats.messages).toHaveLength(0);
    expect(s.llm.requests).toHaveLength(0);
  });
});

describe("chat threads and instructions", () => {
  it("loads a thread and saves trimmed instructions", async () => {
    const s = setup();
    const chat = await s.chats.create(s.content.id, "Chat");
    await s.chats.addMessage(chat.id, "user", "Hi", []);

    const thread = await getChatThread(s.deps, chat.id);
    expect(thread.ok && thread.value.messages).toHaveLength(1);

    const saved = await setChatInstructions(s.deps, {
      chatId: chat.id,
      instructions: "  Be brief ",
    });
    expect(saved.ok && saved.value.instructions).toBe("Be brief");
    const cleared = await setChatInstructions(s.deps, { chatId: chat.id, instructions: "  " });
    expect(cleared.ok && cleared.value.instructions).toBeNull();

    const tooLong = await setChatInstructions(s.deps, {
      chatId: chat.id,
      instructions: "x".repeat(2001),
    });
    expect(!tooLong.ok && tooLong.error.code).toBe("validation");
    const gone = await getChatThread(s.deps, "missing" as ChatId);
    expect(!gone.ok && gone.error.code).toBe("not_found");
  });
});

describe("helpers", () => {
  it("merges consecutive messages of one role", () => {
    expect(
      toLlmMessages([
        { role: "user", text: "a" },
        { role: "user", text: "b" },
        { role: "assistant", text: "c" },
      ]),
    ).toEqual([
      { role: "user", content: "a\n\nb" },
      { role: "assistant", content: "c" },
    ]);
  });

  it("makes short chat titles", () => {
    expect(chatTitleFrom("What is ATP?\nmore")).toBe("What is ATP?");
    const long = chatTitleFrom(
      "Explain how oxidative phosphorylation works and why oxygen is the final acceptor",
    );
    expect(long.length).toBeLessThanOrEqual(61);
    expect(long.endsWith("…")).toBe(true);
  });

  it("spreads picks evenly and builds 1-based paragraph tokens", async () => {
    expect(spreadEvenly([1, 2, 3, 4, 5, 6], 3)).toEqual([1, 3, 5]);
    const seg = {
      idx: 3,
      locator: { type: "offset" as const, start: 0, end: 1 },
    } as Segment;
    expect(segmentToken(seg)).toBe("[§4]");
  });

  it("falls back to evenly spread passages when search finds nothing", async () => {
    const s = setup();
    await seedPdf(s);
    const ctx = await buildChatContext(s.deps, s.content, "zzz qqq", {
      maxFullTokens: 1,
      topK: 2,
    });
    expect(ctx.mode).toBe("search");
    expect(ctx.segments.map((x) => x.idx)).toEqual([0, 2]);
  });

  it("states the custom instructions after the citation rules", () => {
    const p = buildChatSystemPrompt({
      kind: "pdf",
      title: "Cells",
      mode: "full",
      instructions: "Use Vietnamese.",
    });
    expect(p.indexOf("[p.N]")).toBeLessThan(p.indexOf("Use Vietnamese."));
  });
});
