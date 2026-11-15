"use client";

import type { ContentId } from "@thoth/core";
import { Button, CancelButton, Dialog, Select } from "@thoth/ui";
import { useEffect, useState } from "react";
import { listTopicsAction, type TopicOption } from "@/features/quiz/actions";
import { LANGUAGES, TopicFields } from "@/features/quiz/topic-fields";
import { generateFlashcardsAction } from "./actions";

export function GenerateFlashcardsDialog({
  contentId,
  onClose,
  onStarted,
}: {
  contentId: ContentId;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [count, setCount] = useState(15);
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
    const r = await generateFlashcardsAction(contentId, { count, chapterIds, focus, language });
    setPending(false);
    if (!r.ok) return setError(r.error);
    onStarted();
  }

  return (
    <Dialog
      title="Generate flashcards"
      onClose={onClose}
      actions={
        <>
          <CancelButton onClick={onClose} />
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Starting" : "Generate flashcards"}
          </Button>
        </>
      }
    >
      <div className="field max-w-none">
        <label className="field__label" htmlFor="cards-count">
          Number of cards
        </label>
        <input
          id="cards-count"
          type="number"
          min={1}
          max={60}
          className="field__input"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </div>
      <TopicFields topics={topics} selected={chapterIds} onChange={setChapterIds} />
      <div className="field max-w-none">
        <label className="field__label" htmlFor="cards-focus">
          Focus (optional)
        </label>
        <input
          id="cards-focus"
          className="field__input"
          placeholder="For example, key terms and their causes"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
        />
      </div>
      <div className="field max-w-none">
        <label className="field__label" htmlFor="cards-language">
          Language
        </label>
        <Select id="cards-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
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
