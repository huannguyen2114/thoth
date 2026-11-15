"use client";

import type { QuizQuestion, QuizResponse } from "@thoth/core";
import { cx } from "@thoth/ui";

/** The learner's pending answer. null means nothing chosen yet. */
export type Draft = QuizResponse | null;

const optionClass = (selected: boolean, state?: "right" | "wrong" | "missed") =>
  cx(
    "type-body flex w-full items-start gap-3 rounded-md border p-3 text-left text-ink",
    selected ? "border-accent bg-accent-tint" : "border-border-control bg-surface-200",
    state === "right" && "border-success bg-success-tint",
    state === "wrong" && "border-danger bg-danger-tint",
    state === "missed" && "border-success",
  );

/** Which answer inputs a question needs. Locked after submit so the learner reads the feedback. */
export function QuestionInput({
  question,
  draft,
  onChange,
  locked,
  onSubmit,
}: {
  question: QuizQuestion;
  draft: Draft;
  onChange: (d: Draft) => void;
  locked: boolean;
  onSubmit: () => void;
}) {
  const answer = question.answer;
  const choices = question.choices ?? [];

  if (answer.type === "multiple_choice") {
    const picked = draft?.type === "multiple_choice" ? draft.index : null;
    return (
      <div role="radiogroup" aria-label="Choices" className="flex flex-col gap-2">
        {choices.map((c, i) => (
          <label
            key={c}
            className={optionClass(
              picked === i,
              locked
                ? i === answer.index
                  ? "right"
                  : picked === i
                    ? "wrong"
                    : undefined
                : undefined,
            )}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              className="mt-1 accent-accent"
              checked={picked === i}
              disabled={locked}
              onChange={() => onChange({ type: "multiple_choice", index: i })}
            />
            {c}
          </label>
        ))}
      </div>
    );
  }

  if (answer.type === "multi_select") {
    const picked = draft?.type === "multi_select" ? draft.indices : [];
    const toggle = (i: number) =>
      onChange({
        type: "multi_select",
        indices: picked.includes(i) ? picked.filter((p) => p !== i) : [...picked, i],
      });
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="type-caption mb-2 text-ink-muted">Select all that apply.</legend>
        {choices.map((c, i) => {
          const isRight = answer.indices.includes(i);
          const isPicked = picked.includes(i);
          return (
            <label
              key={c}
              className={cx(
                "check",
                "rounded-md border p-3",
                locked && isRight && isPicked && "border-success bg-success-tint",
                locked && !isRight && isPicked && "border-danger bg-danger-tint",
                locked && isRight && !isPicked && "border-success",
                !(locked && (isRight || isPicked)) && "border-border-control bg-surface-200",
              )}
            >
              <input
                type="checkbox"
                checked={isPicked}
                disabled={locked}
                onChange={() => toggle(i)}
              />
              {c}
            </label>
          );
        })}
      </fieldset>
    );
  }

  if (answer.type === "true_false") {
    const picked = draft?.type === "true_false" ? draft.value : null;
    return (
      <div role="radiogroup" aria-label="True or false" className="flex gap-2">
        {[true, false].map((v) => (
          <label
            key={String(v)}
            className={cx(
              optionClass(
                picked === v,
                locked
                  ? v === answer.value
                    ? "right"
                    : picked === v
                      ? "wrong"
                      : undefined
                  : undefined,
              ),
              "flex-1 items-center",
            )}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              className="accent-accent"
              checked={picked === v}
              disabled={locked}
              onChange={() => onChange({ type: "true_false", value: v })}
            />
            {v ? "True" : "False"}
          </label>
        ))}
      </div>
    );
  }

  if (answer.type === "fill_blank") {
    const text = draft?.type === "fill_blank" ? draft.text : "";
    return (
      <div className="field max-w-none">
        <label className="field__label" htmlFor="answer-blank">
          Your answer
        </label>
        <input
          id="answer-blank"
          className="field__input"
          value={text}
          disabled={locked}
          autoComplete="off"
          onChange={(e) => onChange({ type: "fill_blank", text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) onSubmit();
          }}
        />
      </div>
    );
  }

  const text = draft?.type === "free_response" ? draft.text : "";
  return (
    <div className="field max-w-none">
      <label className="field__label" htmlFor="answer-free">
        Your answer
      </label>
      <textarea
        id="answer-free"
        rows={5}
        className="field__input h-auto w-full py-3"
        value={text}
        disabled={locked}
        placeholder="Explain in your own words"
        onChange={(e) => onChange({ type: "free_response", text: e.target.value })}
      />
    </div>
  );
}

/** A draft is ready to submit when something was chosen or written. */
export function isAnswered(d: Draft): boolean {
  if (!d) return false;
  switch (d.type) {
    case "multiple_choice":
    case "true_false":
      return true;
    case "multi_select":
      return d.indices.length > 0;
    case "fill_blank":
    case "free_response":
      return d.text.trim().length > 0;
  }
}
