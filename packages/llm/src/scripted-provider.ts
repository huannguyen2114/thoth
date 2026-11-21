import type { LlmProvider, LlmRequest, LlmStreamEvent, Result } from "@thoth/core";
import { appError, err, ok } from "@thoth/core";
import type { z } from "zod";

/**
 * Deterministic provider for the end-to-end tests (ADR-0028). Selected by THOTH_LLM=scripted
 * in the composition root and never shown in the UI.
 *
 * Every reply is built from the request itself (its `context` and prompts), so citations point
 * at real segments and the same input always gives the same output. A task or prompt it does
 * not know returns an `llm_unavailable` error: a gap fails loudly instead of passing quietly.
 *
 * It matches the prompts in packages/core (chapters, summary, notes, quiz and exam, flashcards,
 * grading, chat, whiteboard mind map and Ask Claude). When a prompt's wording changes, the unit tests here fail first.
 */

/** A citation token as the model writes it: [p.3], [03:21], [1:02:03], [§4]. */
const TOKEN = /\[(?:p\.\d+|\d{1,2}(?::\d{2}){1,2}|§\d+)\]/;

interface Passage {
  token: string;
  text: string;
}

/** `[token] text` lines of the source context, in order. */
function passagesOf(context: string | undefined): Passage[] {
  const out: Passage[] = [];
  for (const line of (context ?? "").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^(${TOKEN.source})\\s*(.*)$`));
    if (m?.[1]) out.push({ token: m[1], text: (m[2] ?? "").trim() });
  }
  return out;
}

const words = (text: string, n: number) => text.split(/\s+/).filter(Boolean).slice(0, n).join(" ");
const sentence = (text: string) => {
  const t = text.trim().replace(/[.!?…]+$/, "");
  return t === "" ? "The source continues" : t;
};
/** The first sentence of a passage, cut to at most `n` words, without its closing punctuation. */
const snippet = (text: string, n: number) => {
  const first = text.trim().split(/(?<=[.!?])\s/)[0] ?? "";
  return sentence(words(first, n));
};
const nth = <T>(items: readonly T[], i: number): T | undefined =>
  items.length === 0 ? undefined : items[i % items.length];

const unknown = (what: string) =>
  appError(
    "llm_unavailable",
    `ScriptedLlmProvider has no scripted reply for ${what}. Teach it in packages/llm/src/scripted-provider.ts.`,
  );

type QuestionType =
  | "multiple_choice"
  | "multi_select"
  | "true_false"
  | "fill_blank"
  | "free_response";
const questionTypes: readonly QuestionType[] = [
  "multiple_choice",
  "multi_select",
  "true_false",
  "fill_blank",
  "free_response",
];

export interface ScriptedOptions {
  /** Pause between streamed chunks, so the UI shows a streaming state. Default 0. */
  chunkDelayMs?: number;
}

export class ScriptedLlmProvider implements LlmProvider {
  readonly id = "fake" as const;
  private readonly chunkDelayMs: number;

  constructor(options: ScriptedOptions = {}) {
    this.chunkDelayMs = options.chunkDelayMs ?? 0;
  }

  async generateText(req: LlmRequest): Promise<Result<string>> {
    const text = this.textFor(req);
    return text === null ? err(unknown(describe(req))) : ok(text);
  }

  async *streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const text = this.textFor(req);
    if (text === null) {
      yield { type: "error", message: unknown(describe(req)).message };
      return;
    }
    for (const chunk of text.split(/(?<= |\n)/)) {
      if (req.signal?.aborted) return;
      if (this.chunkDelayMs > 0) await new Promise((r) => setTimeout(r, this.chunkDelayMs));
      yield { type: "text", delta: chunk };
    }
    yield { type: "done" };
  }

  async generateObject<S extends z.ZodType>(
    req: LlmRequest,
    schema: S,
  ): Promise<Result<z.infer<S>>> {
    const raw = this.objectFor(req);
    if (raw === null) return err(unknown(describe(req)));
    // Validate with the real schema so a drift between prompt and schema fails here.
    const parsed = schema.safeParse(raw);
    return parsed.success
      ? ok(parsed.data as z.infer<S>)
      : err(appError("llm_bad_output", parsed.error.message));
  }

  // ---- text replies -------------------------------------------------------------------

  private textFor(req: LlmRequest): string | null {
    const user = lastUser(req);
    if (
      req.task === "chat" &&
      req.system.startsWith("You are Thoth, a study companion for a whole space")
    )
      return spaceChatReply(req, user);
    if (req.task === "chat") return chatReply(req, user);
    if (req.task === "summary") {
      if (req.system.startsWith("You draft study notes")) return notesReply(req);
      if (req.system.startsWith("You write study summaries")) return summaryReply(req);
    }
    return null;
  }

  // ---- structured replies -------------------------------------------------------------

  private objectFor(req: LlmRequest): unknown {
    switch (req.task) {
      case "chapters":
        return chaptersReply(req);
      case "quiz":
        return quizReply(req);
      case "flashcards":
        return flashcardsReply(req);
      case "grading":
        return gradingReply(req);
      case "chat":
        if (req.system.startsWith("You are Thoth's mind-map assistant")) return mindMapReply(req);
        if (req.system.startsWith("You are Thoth's whiteboard assistant"))
          return boardOpsReply(req);
        return null;
      default:
        return null;
    }
  }
}

function describe(req: LlmRequest): string {
  return `task "${req.task}" (${req.system.slice(0, 40).replace(/\s+/g, " ")}…)`;
}

const lastUser = (req: LlmRequest) => [...req.messages].reverse().find((m) => m.role === "user");

// ---- chat -------------------------------------------------------------------------------

function chatReply(req: LlmRequest, user: { content: string } | undefined): string {
  const question = (user?.content ?? "").trim();
  const passages = passagesOf(req.context);
  if (passages.length === 0) {
    return "The source does not cover that, so I can only answer from general knowledge.";
  }
  const first = passages[0] as Passage;
  const lines = [
    `You asked: "${words(question, 12)}". Based on the source, ${snippet(first.text, 18)}. ${first.token}`,
  ];
  const second = passages.find((p) => p.token !== first.token);
  if (second) lines.push(`It also says: ${snippet(second.text, 14)}. ${second.token}`);
  return lines.join("\n\n");
}

/**
 * Space chat (doc 22): the context holds `<source id="Sn" title="…">` blocks. The answer cites
 * the first passage of the first two sources as `[S1 <token>]` and `[S2 <token>]`, so a test can
 * check that a chip opens the second content at the right place.
 */
function spaceChatReply(req: LlmRequest, user: { content: string } | undefined): string {
  const question = (user?.content ?? "").trim();
  const blocks = [
    ...(req.context ?? "").matchAll(
      /<source id="(S\d+)" title="([^"]*)"[^>]*>\n([\s\S]*?)<\/source>/g,
    ),
  ].map((m) => ({ id: m[1] ?? "", title: m[2] ?? "", first: passagesOf(m[3])[0] }));
  const cited = blocks.filter((b) => b.first).slice(0, 2);
  if (cited.length === 0) {
    return "The sources in this space do not cover that, so I can only answer from general knowledge.";
  }
  return cited
    .map((b, i) => {
      const p = b.first as Passage;
      const inner = p.token.slice(1, -1);
      const lead =
        i === 0 ? `You asked: "${words(question, 12)}". ${b.title} says` : `${b.title} adds`;
      return `${lead}: ${snippet(p.text, 14)}. [${b.id} ${inner}]`;
    })
    .join("\n\n");
}

// ---- summary and notes -----------------------------------------------------------------

function summaryReply(req: LlmRequest): string {
  const passages = passagesOf(req.context);
  const first = passages[0];
  if (!first) return "# Summary\n\nThe source has no text to summarise.";
  const points = passages.slice(0, 4).map((p) => `- ${snippet(p.text, 16)}. ${p.token}`);
  return [
    "# Scripted summary",
    "",
    `This source starts with: ${snippet(first.text, 16)}. ${first.token}`,
    "",
    "## Key points",
    "",
    ...points,
    "",
    "## Key takeaways",
    "",
    `- The main idea is ${snippet(first.text, 8)}. ${first.token}`,
  ].join("\n");
}

function notesReply(req: LlmRequest): string {
  const passages = passagesOf(req.context);
  const first = passages[0];
  if (!first) return "# Notes\n\nThe source has no text to take notes from.";
  return [
    "# Scripted notes",
    "",
    "## Main ideas",
    "",
    ...passages
      .slice(0, 3)
      .map((p) => `- **${words(p.text, 3)}**: ${snippet(p.text, 12)}. ${p.token}`),
    "",
    "## Questions to think about",
    "",
    "1. What is the central idea?",
    "2. How do the parts connect?",
    "3. Where would you apply this?",
  ].join("\n");
}

// ---- chapters ---------------------------------------------------------------------------

function chaptersReply(req: LlmRequest) {
  const blocks = [...(req.context ?? "").matchAll(/^\[(\d+)\] \([^)]*\) (.*)$/gm)].map((m) => ({
    idx: Number(m[1]),
    text: (m[2] ?? "").trim(),
  }));
  if (blocks.length === 0) return null;
  const wanted = Number(lastUser(req)?.content.match(/Write about (\d+) chapter/)?.[1] ?? 1);
  const count = Math.max(1, Math.min(wanted, blocks.length));
  const chapters = Array.from({ length: count }, (_, k) => {
    const block = blocks[Math.floor((k * blocks.length) / count)] as (typeof blocks)[number];
    return {
      startSegment: block.idx,
      title: `Part ${k + 1}: ${words(block.text, 4) || "Overview"}`,
      summary: `${snippet(block.text, 20)}.`,
    };
  });
  return { chapters };
}

// ---- quiz and exam ----------------------------------------------------------------------

function quizReply(req: LlmRequest) {
  const topic = req.system.match(/^Topic: (.*)$/m)?.[1]?.trim();
  const count = Number(req.system.match(/Write exactly (\d+) questions/)?.[1]);
  if (!Number.isInteger(count) || count < 1) return null;
  const types = questionTypes.filter((t) => new RegExp(`^- ${t}:`, "m").test(req.system));
  const passages = passagesOf(req.context);
  if (types.length === 0 || passages.length === 0) return null;

  const questions = Array.from({ length: count }, (_, i) => {
    const type = nth(types, i) as QuestionType;
    const p = nth(passages, i) as Passage;
    const about = topic ? ` about ${topic}` : "";
    const base = {
      explanation: `The source says: ${snippet(p.text, 16)}.`,
      source: p.token,
    };
    const tag = `Q${i + 1}`;
    switch (type) {
      case "multiple_choice":
        return {
          ...base,
          type,
          prompt: `${tag} (multiple choice)${about}: which statement matches the source?`,
          choices: [
            "The claim the source supports",
            "A claim the source contradicts",
            "A claim the source never makes",
          ],
          correctIndex: 0,
        };
      case "multi_select":
        return {
          ...base,
          type,
          prompt: `${tag} (multi select)${about}: which statements match the source?`,
          choices: [
            "The first supported claim",
            "The second supported claim",
            "A contradicted claim",
            "An invented claim",
          ],
          correctIndices: [0, 1],
        };
      case "true_false":
        return {
          ...base,
          type,
          prompt: `${tag} (true or false)${about}: the source supports the claim "${words(p.text, 6)}".`,
          correct: true,
        };
      case "fill_blank":
        return {
          ...base,
          type,
          prompt: `${tag} (fill in the blank)${about}: type the word scripted: _____`,
          acceptedAnswers: ["scripted"],
        };
      case "free_response":
        return {
          ...base,
          type,
          prompt: `${tag} (free response)${about}: explain the main idea in your own words.`,
          rubric: `A good answer says: ${snippet(p.text, 20)}.`,
        };
      default:
        return null;
    }
  });
  return { questions };
}

// ---- flashcards -------------------------------------------------------------------------

function flashcardsReply(req: LlmRequest) {
  const count = Number(req.system.match(/Write exactly (\d+) cards/)?.[1]);
  const header = req.system.split("\n").findIndex((l) => l.includes("spread across these topics"));
  if (!Number.isInteger(count) || count < 1 || header < 0) return null;
  const topics: string[] = [];
  for (const line of req.system.split("\n").slice(header + 1)) {
    if (!line.startsWith("- ")) break;
    topics.push(line.slice(2).trim());
  }
  const passages = passagesOf(req.context);
  if (topics.length === 0 || passages.length === 0) return null;
  const cards = Array.from({ length: count }, (_, i) => {
    const p = nth(passages, i) as Passage;
    return {
      front: `Card ${i + 1}: what does the source say about "${words(p.text, 4)}"?`,
      back: `${snippet(p.text, 20)}.`,
      topic: nth(topics, i) as string,
      source: p.token,
    };
  });
  return { cards };
}

// ---- grading ----------------------------------------------------------------------------

function gradingReply(req: LlmRequest) {
  const answer = lastUser(req)?.content.split("Learner's answer:\n")[1]?.trim();
  if (answer === undefined) return null;
  // A real attempt (five words or more) passes; anything shorter does not.
  const enough = answer.split(/\s+/).filter(Boolean).length >= 5;
  return enough
    ? { score: 0.9, feedback: "You covered the main point of the rubric." }
    : { score: 0.2, feedback: "You mention the topic but miss the key points." };
}

// ---- whiteboard (ADR-0031) ---------------------------------------------------------------

/** A root, one theme per passage (at most 4), each citing its passage. */
function mindMapReply(req: LlmRequest) {
  const passages = passagesOf(req.context).slice(0, 4);
  if (passages.length === 0) return null;
  const root = passages[0] as Passage;
  return {
    title: "Map of the source",
    takeaway: "The main ideas of the source, in the order it covers them.",
    nodes: [
      { id: "root", parent: null, label: "Source overview", source: root.token },
      ...passages.map((p, i) => ({
        id: `n${i + 1}`,
        parent: "root",
        label: words(sentence(p.text), 4) || `Idea ${i + 1}`,
        source: p.token,
      })),
    ],
  };
}

/** A left-to-right flow of up to three steps, each citing a passage, joined by arrows. */
function boardOpsReply(req: LlmRequest) {
  const passages = passagesOf(req.context).slice(0, 3);
  const steps = passages.length > 0 ? passages : [{ token: "", text: "Your request" }];
  const ops: { op: "add"; id: string; fields: Record<string, unknown> }[] = steps.map((p, i) => ({
    op: "add",
    id: `step${i + 1}`,
    fields: {
      type: "shape",
      kind: "rounded",
      x: 1200 + i * 264,
      y: 0,
      w: 240,
      h: 96,
      text: words(sentence(p.text), 5) || `Step ${i + 1}`,
      ...(p.token ? { source: p.token } : {}),
    },
  }));
  for (let i = 1; i < steps.length; i++) {
    ops.push({
      op: "add",
      id: `link${i}`,
      fields: { type: "arrow", from: `step${i}`, to: `step${i + 1}` },
    });
  }
  return { summary: `Added a ${steps.length}-step flow.`, ops };
}
