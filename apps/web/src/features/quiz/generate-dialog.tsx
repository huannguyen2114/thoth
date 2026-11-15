"use client";

import {
  type QuizDifficulty,
  type QuizQuestionType,
  quizDifficulties,
  quizQuestionTypes,
} from "@thoth/core";
import { Button, Select } from "@thoth/ui";
import { useEffect, useState } from "react";
import { generateQuizAction, listTopicsAction, type TopicOption } from "./actions";
import { CancelButton, Dialog } from "./dialog";
import { LANGUAGES, TopicFields } from "./topic-fields";

export const typeLabels: Record<QuizQuestionType, string> = {
  multiple_choice: "Multiple choice",
  multi_select: "Multi select",
  free_response: "Free response",
  true_false: "True or false",
  fill_blank: "Fill in the blank",
};

export function GenerateQuizDialog({
  contentId,
  onClose,
  onStarted,
}: {
  contentId: Parameters<typeof listTopicsAction>[0];
  onClose: () => void;
  onStarted: () => void;
}) {
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [types, setTypes] = useState<QuizQuestionType[]>(["multiple_choice", "true_false"]);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [count, setCount] = useState(10);
  const [focus, setFocus] = useState("");
  const [language, setLanguage] = useState("English");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    listTopicsAction(contentId).then(setTopics);
  }, [contentId]);

  async function submit() {
    setPending(true);
    setError(null);
    const r = await generateQuizAction(contentId, {
      types,
      difficulty,
      count,
      chapterIds,
      focus,
      language,
    });
    setPending(false);
    if (!r.ok) return setError(r.error);
    onStarted();
  }

  return (
    <Dialog
      title="Generate a quiz"
      onClose={onClose}
      actions={
        <>
          <CancelButton onClick={onClose} />
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Starting" : "Generate quiz"}
          </Button>
        </>
      }
    >
      <p className="modal__body">You get one quiz for each topic you pick.</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="field__label">Question types</legend>
        {quizQuestionTypes.map((t) => (
          <label key={t} className="check">
            <input
              type="checkbox"
              checked={types.includes(t)}
              onChange={() =>
                setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])
              }
            />
            {typeLabels[t]}
          </label>
        ))}
      </fieldset>
      <div className="field max-w-none">
        <label className="field__label" htmlFor="quiz-difficulty">
          Difficulty
        </label>
        <Select
          id="quiz-difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}
        >
          {quizDifficulties.map((d) => (
            <option key={d} value={d}>
              {d[0]?.toUpperCase()}
              {d.slice(1)}
            </option>
          ))}
        </Select>
      </div>
      <div className="field max-w-none">
        <label className="field__label" htmlFor="quiz-count">
          Questions per topic
        </label>
        <input
          id="quiz-count"
          type="number"
          min={1}
          max={30}
          className="field__input"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </div>
      <TopicFields topics={topics} selected={chapterIds} onChange={setChapterIds} />
      <div className="field max-w-none">
        <label className="field__label" htmlFor="quiz-focus">
          Focus (optional)
        </label>
        <input
          id="quiz-focus"
          className="field__input"
          placeholder="For example, how the cycle is regulated"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
        />
      </div>
      <div className="field max-w-none">
        <label className="field__label" htmlFor="quiz-language">
          Language
        </label>
        <Select id="quiz-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </Select>
      </div>
      {error && (
        <div className="callout callout--danger" role="alert">
          <p className="callout__text">{error}</p>
        </div>
      )}
    </Dialog>
  );
}
