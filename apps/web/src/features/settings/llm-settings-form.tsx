"use client";

import {
  type LlmModel,
  type LlmProviderId,
  type LlmSettings,
  type LlmTask,
  llmModels,
  llmProviderIds,
  llmProviderLabels,
  llmTasks,
} from "@thoth/core";
import { Button, cx, Select } from "@thoth/ui";
import { useActionState } from "react";
import { type SaveState, saveLlmSettingsAction } from "./actions";

const modelLabels: Record<LlmModel, string> = {
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-haiku-5-5": "Claude Haiku 5.5",
};

const taskLabels: Record<LlmTask, { label: string; help: string }> = {
  chat: { label: "Chat", help: "Answers questions about your material." },
  chapters: { label: "Chapters", help: "Splits new content into sections." },
  summary: { label: "Summaries", help: "Detailed, cheat sheet and short summaries." },
  quiz: { label: "Quizzes", help: "Writes questions and explanations." },
  flashcards: { label: "Flashcards", help: "Writes card fronts and backs." },
  grading: { label: "Grading", help: "Checks free-response answers." },
};

const providerHelp: Record<LlmProviderId, string> = {
  "claude-subscription": "Runs Claude Code on this Mac with your Claude plan. No API key needed.",
  "anthropic-api":
    "Bills your Anthropic API account. Set ANTHROPIC_API_KEY in apps/web/.env.local.",
};

export function LlmSettingsForm({
  initial,
  hasApiKey,
}: {
  initial: LlmSettings;
  hasApiKey: boolean;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveLlmSettingsAction, {
    error: null,
    saved: false,
  });

  return (
    <form action={action} className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 type-heading-3 text-ink">Provider</legend>
        {llmProviderIds.map((id) => (
          <label
            key={id}
            className="flex cursor-pointer gap-3 rounded-lg border border-border-subtle bg-surface-200 p-4 has-[:checked]:border-accent has-[:checked]:bg-accent-tint"
          >
            <input
              type="radio"
              name="provider"
              value={id}
              defaultChecked={initial.provider === id}
              className="mt-1 accent-accent"
            />
            <span className="flex flex-col gap-1">
              <span className="type-label text-ink">{llmProviderLabels[id]}</span>
              <span className="type-caption text-ink-muted">{providerHelp[id]}</span>
              {id === "anthropic-api" && (
                <span
                  className={cx("badge w-fit", hasApiKey ? "badge--success" : "badge--warning")}
                >
                  {hasApiKey ? "API key found" : "No API key in .env.local"}
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 type-heading-3 text-ink">Model per task</legend>
        <p className="type-caption text-ink-muted">
          Opus 5.5 gives the best answers. Sonnet and Haiku are faster and cost less on an API key.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {llmTasks.map((task) => (
            <div key={task} className="field max-w-none">
              <label htmlFor={`model-${task}`} className="field__label">
                {taskLabels[task].label}
              </label>
              <Select
                id={`model-${task}`}
                name={`model.${task}`}
                defaultValue={initial.models[task]}
                className="w-full"
                aria-describedby={`model-${task}-help`}
              >
                {llmModels.map((m) => (
                  <option key={m} value={m}>
                    {modelLabels[m]}
                  </option>
                ))}
              </Select>
              <span id={`model-${task}-help`} className="field__help">
                {taskLabels[task].help}
              </span>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving" : "Save settings"}
        </Button>
        <p role="status" className="type-caption">
          {state.error ? (
            <span className="text-danger">{state.error}</span>
          ) : state.saved ? (
            <span className="text-success">Settings saved</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
