"use client";

import type { TopicOption } from "./actions";

/** Topic checkboxes shared by the quiz and flashcard dialogs. Nothing ticked means every topic. */
export function TopicFields({
  topics,
  selected,
  onChange,
}: {
  topics: TopicOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (topics.length === 0) {
    return (
      <p className="type-caption text-ink-muted">
        This content has no chapters, so the whole text is used.
      </p>
    );
  }
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="field__label">Topics</legend>
      <p className="field__help">Leave all unticked to use every topic.</p>
      {topics.map((t) => (
        <label key={t.id} className="check">
          <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
          {t.title}
        </label>
      ))}
    </fieldset>
  );
}

export const LANGUAGES = ["English", "Vietnamese", "French", "Spanish", "German", "Japanese"];
