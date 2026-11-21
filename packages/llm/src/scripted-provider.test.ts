import {
  buildChatSystemPrompt,
  buildNotesSystem,
  buildSpaceChatSystemPrompt,
  buildSummarySystem,
  CHAPTERS_SYSTEM,
  type ContentId,
  chaptersOutputSchema,
  chaptersUserPrompt,
  type LlmRequest,
  linkSpaceCitations,
  notesUserMessage,
  parseCitations,
  parseLinks,
  summaryUserMessage,
} from "@thoth/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
// Not part of core's public index: imported by path so the tests use the real schemas and prompts.
import {
  flashcardsSystemPrompt,
  flashcardsUserMessage,
} from "../../core/src/usecases/flashcards/prompts";
import { generatedCardsSchema } from "../../core/src/usecases/flashcards/schemas";
import {
  GRADING_SYSTEM,
  gradingUserMessage,
  quizSystemPrompt,
  quizUserMessage,
} from "../../core/src/usecases/quiz/prompts";
import { freeResponseGradeSchema, generatedQuizSchema } from "../../core/src/usecases/quiz/schemas";
import {
  askSystemPrompt,
  claudeMindMapSchema,
  claudeOpsSchema,
  mindMapSystemPrompt,
} from "../../core/src/usecases/whiteboard/prompts";
import { ScriptedLlmProvider } from "./scripted-provider";

const llm = new ScriptedLlmProvider();
const context =
  "[p.2] Photosynthesis turns light into sugar in plants.\n[p.3] Chlorophyll absorbs red light.";

async function collect(req: LlmRequest) {
  let text = "";
  let last: string | undefined;
  for await (const e of llm.streamText(req)) {
    if (e.type === "text") text += e.delta;
    last = e.type;
  }
  return { text, last };
}

describe("ScriptedLlmProvider", () => {
  it("writes chapters that start at real segments", async () => {
    const ctx = Array.from(
      { length: 6 },
      (_, i) => `[${i + 10}] (p.${i + 1}) Segment ${i} text here`,
    ).join("\n\n");
    const r = await llm.generateObject(
      {
        task: "chapters",
        system: CHAPTERS_SYSTEM,
        context: ctx,
        messages: [
          {
            role: "user",
            content: chaptersUserPrompt({
              title: "T",
              part: 1,
              parts: 1,
              firstIdx: 10,
              lastIdx: 15,
              targetChapters: 3,
            }),
          },
        ],
      },
      chaptersOutputSchema,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.chapters.map((c) => c.startSegment)).toEqual([10, 12, 14]);
  });

  for (const [types, count] of [
    [["multiple_choice", "multi_select", "true_false", "fill_blank", "free_response"], 7],
    [["multiple_choice"], 2],
  ] as const) {
    it(`writes ${count} quiz questions for ${types.length} type(s), schema-valid, citing real tokens`, async () => {
      const r = await llm.generateObject(
        {
          task: "quiz",
          system: quizSystemPrompt({
            topic: "Plants",
            types,
            difficulty: "medium",
            count,
            focus: "",
            language: "English",
          }),
          context,
          messages: [{ role: "user", content: quizUserMessage("Plants", count) }],
        },
        generatedQuizSchema,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.questions).toHaveLength(count);
      expect(new Set(r.value.questions.map((q) => q.type))).toEqual(new Set(types));
      for (const q of r.value.questions) expect(["[p.2]", "[p.3]"]).toContain(q.source);
    });
  }

  it("writes flashcards on the requested topics", async () => {
    const r = await llm.generateObject(
      {
        task: "flashcards",
        system: flashcardsSystemPrompt({
          topics: ["Light", "Sugar"],
          count: 3,
          focus: "",
          language: "English",
        }),
        context,
        messages: [{ role: "user", content: flashcardsUserMessage(3) }],
      },
      generatedCardsSchema,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cards.map((c) => c.topic)).toEqual(["Light", "Sugar", "Light"]);
    expect(r.value.cards[0]?.source).toBe("[p.2]");
  });

  it("grades by answer length", async () => {
    const grade = (answer: string) =>
      llm.generateObject(
        {
          task: "grading",
          system: GRADING_SYSTEM,
          messages: [
            { role: "user", content: gradingUserMessage({ question: "Q?", rubric: "R", answer }) },
          ],
        },
        freeResponseGradeSchema,
      );
    const good = await grade("Plants turn light into sugar using chlorophyll");
    const bad = await grade("idk");
    expect(good.ok && good.value.score).toBeGreaterThanOrEqual(0.7);
    expect(bad.ok && bad.value.score).toBeLessThan(0.7);
  });

  it("streams a chat answer whose first citation is the first token in the context", async () => {
    const { text, last } = await collect({
      task: "chat",
      system: buildChatSystemPrompt({
        kind: "pdf",
        title: "Bio",
        mode: "full",
        instructions: null,
      }),
      context: `<source title="Bio" kind="pdf">\n${context}\n</source>`,
      messages: [{ role: "user", content: "What is photosynthesis?" }],
    });
    expect(last).toBe("done");
    expect(parseCitations(text)[0]?.raw).toBe("[p.2]");
    expect(text).toContain("What is photosynthesis?");
  });

  it("streams a space chat answer citing the first passage of the first two sources", async () => {
    const { text } = await collect({
      task: "chat",
      system: buildSpaceChatSystemPrompt({ spaceName: "Bio", mode: "full", instructions: null }),
      context: [
        `<source id="S1" title="Plants" kind="pdf">\n${context}\n</source>`,
        '<source id="S2" title="Cells" kind="text">\n[§1] Cells divide.\n[§2] More.\n</source>',
      ].join("\n\n"),
      messages: [{ role: "user", content: "How do plants eat?" }],
    });
    expect(text).toContain("[S1 p.2]");
    expect(text).toContain("[S2 §1]");
    const linked = linkSpaceCitations(text, [
      { label: "S1", contentId: "a" as ContentId, title: "Plants", kind: "pdf" },
      { label: "S2", contentId: "b" as ContentId, title: "Cells", kind: "text" },
    ]);
    expect(parseLinks(linked).map((l) => l.href)).toEqual([
      "thoth:c/a?at=p.2",
      "thoth:c/b?at=par.1",
    ]);
  });

  it("streams a summary and notes with citations", async () => {
    const summary = await collect({
      task: "summary",
      system: buildSummarySystem({ template: "short", language: "English" }),
      context,
      messages: [{ role: "user", content: summaryUserMessage }],
    });
    expect(summary.text.startsWith("# Scripted summary")).toBe(true);
    expect(parseCitations(summary.text).length).toBeGreaterThan(0);

    const notes = await llm.generateText({
      task: "summary",
      system: buildNotesSystem("English"),
      context,
      messages: [{ role: "user", content: notesUserMessage }],
    });
    expect(notes.ok && notes.value).toContain("# Scripted notes");
  });

  it("reads source lines with Windows line endings (a browser textarea sends them)", async () => {
    const r = await llm.generateText({
      task: "chat",
      system: "s",
      context: "[§1] First para\r\n\r\nmore\r\n[§2] Second para",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.ok && r.value).toContain("[§1]");
  });

  it("fails loudly for tasks and prompts it does not know", async () => {
    const unknown: LlmRequest = { task: "summary", system: "Something new", messages: [] };
    const text = await llm.generateText(unknown);
    expect(text.ok).toBe(false);
    const obj = await llm.generateObject({ ...unknown, task: "quiz" }, z.object({}));
    expect(obj.ok).toBe(false);
    const streamed = await collect(unknown);
    expect(streamed.last).toBe("error");
  });

  it("rejects a reply that does not fit the caller's schema", async () => {
    const r = await llm.generateObject(
      {
        task: "grading",
        system: GRADING_SYSTEM,
        messages: [{ role: "user", content: "Learner's answer:\nfive words are here ok" }],
      },
      z.object({ nope: z.string() }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("whiteboard replies (ADR-0031)", () => {
  const user = { role: "user" as const, content: "Make a map" };

  it("returns a mind map whose nodes cite the context", async () => {
    const r = await llm.generateObject(
      { task: "chat", system: mindMapSystemPrompt(), context, messages: [user] },
      claudeMindMapSchema,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.nodes.filter((n) => n.parent === null)).toHaveLength(1);
    expect(r.value.nodes.map((n) => n.source)).toEqual(["[p.2]", "[p.2]", "[p.3]"]);
  });

  it("returns a linked flow of board operations", async () => {
    const r = await llm.generateObject(
      { task: "chat", system: askSystemPrompt(), context, messages: [user] },
      claudeOpsSchema,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const arrows = r.value.ops.filter((o) => o.fields?.type === "arrow");
    expect(arrows).toEqual([
      { op: "add", id: "link1", fields: { type: "arrow", from: "step1", to: "step2" } },
    ]);
    expect(r.value.ops[0]?.fields?.source).toBe("[p.2]");
  });
});
