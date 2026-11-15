import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeLlmProvider } from "./fake-provider";

const req = { task: "quiz" as const, system: "", messages: [] };

describe("FakeLlmProvider", () => {
  it("validates structured output against the schema", async () => {
    const llm = new FakeLlmProvider(() => '{"question":"What is DNA?"}');
    const r = await llm.generateObject(req, z.object({ question: z.string() }));
    expect(r).toEqual({ ok: true, value: { question: "What is DNA?" } });
  });

  it("returns llm_bad_output instead of throwing on bad JSON", async () => {
    const r = await new FakeLlmProvider(() => "nope").generateObject(req, z.object({}));
    expect(r.ok).toBe(false);
  });
});
