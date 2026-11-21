"use client";

import { type LlmModel, type LlmTask, llmModelLabels, llmTasks, type TaskRoute } from "@thoth/core";
import { Button, Select } from "@thoth/ui";
import { useState } from "react";
import { saveRoutesAction } from "./actions";
import type { ProfileView } from "./providers";

const taskLabels: Record<LlmTask, { label: string; help: string }> = {
  chat: { label: "Chat", help: "Answers questions about your material." },
  chapters: { label: "Chapters", help: "Splits new content into sections." },
  summary: { label: "Summaries", help: "Detailed, cheat sheet and short summaries." },
  quiz: { label: "Quizzes", help: "Writes questions and explanations." },
  flashcards: { label: "Flashcards", help: "Writes card fronts and backs." },
  grading: { label: "Grading", help: "Checks free-response answers." },
};

const modelLabel = (m: string) => llmModelLabels[m as LlmModel] ?? m;

/** A provider and model per task (ADR-0037). */
export function TaskRouting({
  profiles,
  initial,
}: {
  profiles: ProfileView[];
  initial: Record<LlmTask, TaskRoute>;
}) {
  const [routes, setRoutes] = useState(initial);
  const [status, setStatus] = useState<{ error: string | null; saved: boolean }>({
    error: null,
    saved: false,
  });
  const [pending, setPending] = useState(false);

  function setProfile(task: LlmTask, profileId: string) {
    const profile = profiles.find((p) => p.id === profileId);
    const keep = profile?.models.includes(routes[task].model);
    setRoutes({
      ...routes,
      [task]: { profileId, model: keep ? routes[task].model : (profile?.models[0] ?? "") },
    });
    setStatus({ error: null, saved: false });
  }

  function setModel(task: LlmTask, model: string) {
    setRoutes({ ...routes, [task]: { ...routes[task], model } });
    setStatus({ error: null, saved: false });
  }

  async function save() {
    setPending(true);
    const r = await saveRoutesAction(routes);
    setPending(false);
    setStatus(r.ok ? { error: null, saved: true } : { error: r.error, saved: false });
  }

  const usesLocal = llmTasks.some((t) => {
    const p = profiles.find((x) => x.id === routes[t].profileId);
    return (
      p?.kind === "openai-compatible" && (t === "quiz" || t === "grading" || t === "flashcards")
    );
  });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="routing-title">
      <div className="flex flex-col gap-1">
        <h2 id="routing-title" className="type-heading-3 text-ink">
          Provider and model per task
        </h2>
        <p className="type-caption text-ink-muted">
          Opus 5.5 gives the best answers. Small local models are free and private, but they write
          weaker quizzes, flashcards and grading.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
        {llmTasks.map((task) => {
          const profile = profiles.find((p) => p.id === routes[task].profileId);
          return (
            <div key={task} className="grid gap-3 px-4 py-3 sm:grid-cols-3 sm:items-center">
              <div className="flex flex-col">
                <span className="type-label text-ink" id={`route-${task}-label`}>
                  {taskLabels[task].label}
                </span>
                <span className="type-caption text-ink-muted">{taskLabels[task].help}</span>
              </div>
              <Select
                aria-label={`${taskLabels[task].label} provider`}
                value={routes[task].profileId}
                onChange={(e) => setProfile(task, e.target.value)}
                className="w-full"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={`${taskLabels[task].label} model`}
                value={routes[task].model}
                onChange={(e) => setModel(task, e.target.value)}
                className="w-full"
              >
                {(profile?.models ?? []).map((m) => (
                  <option key={m} value={m}>
                    {modelLabel(m)}
                  </option>
                ))}
              </Select>
            </div>
          );
        })}
      </div>

      {usesLocal && (
        <div className="callout callout--info max-w-none" role="note">
          <p className="callout__text">
            Quizzes, flashcards and grading need careful reasoning. Check a few results from a
            non-Claude model before you rely on them.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving" : "Save routing"}
        </Button>
        <p role="status" className="type-caption">
          {status.error ? (
            <span className="text-danger">{status.error}</span>
          ) : status.saved ? (
            <span className="text-success">Routing saved</span>
          ) : null}
        </p>
      </div>
    </section>
  );
}
