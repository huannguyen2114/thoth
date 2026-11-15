import { describe, expect, it } from "vitest";
import { FakeLlm } from "./fakes";
import { FREE_RESPONSE_PASS, gradeFreeResponse, gradeObjective, normalizeAnswer } from "./grading";

describe("normalizeAnswer", () => {
  it("ignores case, accents, punctuation, spacing and a leading article", () => {
    expect(normalizeAnswer("  The  Mitochondrión! ")).toBe("mitochondrion");
    expect(normalizeAnswer("ATP-synthase")).toBe("atp synthase");
  });
});

describe("gradeObjective", () => {
  it("grades multiple choice and true/false all or nothing", () => {
    expect(
      gradeObjective({ type: "multiple_choice", index: 2 }, { type: "multiple_choice", index: 2 })
        ?.score,
    ).toBe(1);
    expect(
      gradeObjective({ type: "multiple_choice", index: 2 }, { type: "multiple_choice", index: 0 })
        ?.correct,
    ).toBe(false);
    expect(
      gradeObjective({ type: "true_false", value: false }, { type: "true_false", value: false })
        ?.correct,
    ).toBe(true);
    expect(
      gradeObjective({ type: "true_false", value: false }, { type: "true_false", value: true })
        ?.score,
    ).toBe(0);
  });

  it("matches fill in the blank after normalising, against any accepted spelling", () => {
    const answer = { type: "fill_blank" as const, accepted: ["mitochondria", "the mitochondrion"] };
    expect(gradeObjective(answer, { type: "fill_blank", text: " Mitochondrion. " })?.correct).toBe(
      true,
    );
    expect(gradeObjective(answer, { type: "fill_blank", text: "chloroplast" })?.correct).toBe(
      false,
    );
    expect(gradeObjective(answer, { type: "fill_blank", text: "   " })?.correct).toBe(false);
  });

  describe("multi select partial credit", () => {
    const answer = { type: "multi_select" as const, indices: [0, 2, 3] };
    const grade = (indices: number[]) => gradeObjective(answer, { type: "multi_select", indices });
    it("full marks only for the exact set", () => {
      expect(grade([3, 0, 2])).toEqual({ correct: true, score: 1, feedback: null });
    });
    it("gives a third per right pick", () => {
      expect(grade([0])?.score).toBeCloseTo(1 / 3);
      expect(grade([0, 2])?.score).toBeCloseTo(2 / 3);
      expect(grade([0, 2])?.correct).toBe(false);
    });
    it("subtracts for wrong picks and never goes below zero", () => {
      expect(grade([0, 2, 3, 1])?.score).toBeCloseTo(2 / 3);
      expect(grade([1])?.score).toBe(0);
      expect(grade([])?.score).toBe(0);
    });
  });

  it("returns null for free response and for a mismatched response type", () => {
    expect(
      gradeObjective({ type: "free_response", rubric: "x" }, { type: "free_response", text: "y" }),
    ).toBeNull();
    expect(
      gradeObjective({ type: "true_false", value: true }, { type: "multiple_choice", index: 0 }),
    ).toBeNull();
  });
});

describe("gradeFreeResponse", () => {
  const q = { prompt: "Why is the gradient needed?" };
  it("passes the rubric and answer to the grading task and maps the score", async () => {
    const llm = new FakeLlm(() => ({ score: 0.75, feedback: "You covered the gradient." }));
    const r = await gradeFreeResponse(
      llm,
      q,
      "Proton gradient drives ATP synthase.",
      "It drives ATP synthase",
    );
    expect(r).toEqual({
      ok: true,
      value: { correct: true, score: 0.75, feedback: "You covered the gradient." },
    });
    expect(llm.requests[0]?.task).toBe("grading");
    expect(llm.requests[0]?.messages[0]?.content).toContain("Proton gradient drives ATP synthase.");
  });
  it("marks a score under the pass mark as not correct", async () => {
    const llm = new FakeLlm(() => ({ score: FREE_RESPONSE_PASS - 0.1, feedback: "Partly." }));
    const r = await gradeFreeResponse(llm, q, "rubric text here", "answer");
    expect(r.ok && r.value.correct).toBe(false);
  });
  it("asks for an answer instead of calling the model when it is blank", async () => {
    const llm = new FakeLlm(() => ({}));
    const r = await gradeFreeResponse(llm, q, "rubric text here", "   ");
    expect(r).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(llm.requests).toHaveLength(0);
  });
  it("returns the model error for a bad reply", async () => {
    const llm = new FakeLlm(() => ({ score: "high" }));
    const r = await gradeFreeResponse(llm, q, "rubric text here", "answer");
    expect(r).toMatchObject({ ok: false, error: { code: "llm_bad_output" } });
  });
});
