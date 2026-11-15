"use client";

import {
  type QuizDifficulty,
  type QuizQuestionType,
  quizDifficulties,
  quizQuestionTypes,
  type SpaceId,
} from "@thoth/core";
import { Button, CancelButton, Dialog, Select } from "@thoth/ui";
import { useState, useTransition } from "react";
import { typeLabels } from "../generate-dialog";
import { LANGUAGES } from "../topic-fields";
import { generateExamAction } from "./actions";

export interface ExamContentOption {
  id: string;
  title: string;
}

const difficultyLabels: Record<QuizDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** YouLearn's "New Exam": pick contents, length and question style for a timed exam. */
export function NewExamDialog({
  spaceId,
  contents,
  onClose,
  onCreated,
}: {
  spaceId: SpaceId;
  contents: ExamContentOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [contentIds, setContentIds] = useState<string[]>(contents.map((c) => c.id));
  const [types, setTypes] = useState<QuizQuestionType[]>([
    "multiple_choice",
    "true_false",
    "free_response",
  ]);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [count, setCount] = useState(10);
  const [durationMin, setDurationMin] = useState(20);
  const [language, setLanguage] = useState("English");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  function submit() {
    setError(null);
    start(async () => {
      const r = await generateExamAction(spaceId, {
        contentIds,
        types,
        difficulty,
        count,
        durationMin,
        language,
      });
      if (r.ok) onCreated();
      else setError(r.error);
    });
  }

  return (
    <Dialog
      title="New exam"
      onClose={onClose}
      actions={
        <>
          <CancelButton onClick={onClose} />
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Creating" : "Create exam"}
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="field__label mb-1">Contents</legend>
        {contents.map((c) => (
          <label key={c.id} className="check">
            <input
              type="checkbox"
              checked={contentIds.includes(c.id)}
              onChange={() => setContentIds((l) => toggle(l, c.id))}
            />
            <span className="truncate">{c.title}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="field__label mb-1">Question types</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {quizQuestionTypes.map((t) => (
            <label key={t} className="check">
              <input
                type="checkbox"
                checked={types.includes(t)}
                onChange={() => setTypes((l) => toggle(l, t))}
              />
              {typeLabels[t]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="field max-w-none">
          <label htmlFor="exam-count" className="field__label">
            Questions
          </label>
          <input
            id="exam-count"
            type="number"
            min={3}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="field__input"
          />
        </div>
        <div className="field max-w-none">
          <label htmlFor="exam-duration" className="field__label">
            Minutes
          </label>
          <input
            id="exam-duration"
            type="number"
            min={5}
            max={180}
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="field__input"
          />
        </div>
        <div className="field max-w-none">
          <label htmlFor="exam-difficulty" className="field__label">
            Difficulty
          </label>
          <Select
            id="exam-difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}
            className="w-full"
          >
            {quizDifficulties.map((d) => (
              <option key={d} value={d}>
                {difficultyLabels[d]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="field max-w-none">
        <label htmlFor="exam-language" className="field__label">
          Language
        </label>
        <Select
          id="exam-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full"
        >
          {LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="callout callout--danger max-w-none" role="alert">
          <p className="m-0">{error}</p>
        </div>
      )}
    </Dialog>
  );
}
