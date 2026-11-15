"use client";

import {
  formatClock,
  parseTimeInput,
  type SourceBounds,
  type SummaryOptionsInput,
  type SummaryRange,
  type SummaryTemplate,
  summaryTemplateLabels,
  summaryTemplates,
} from "@thoth/core";
import { Button, cx, Select } from "@thoth/ui";
import { useState } from "react";
import { Dialog } from "./dialog";

const templateHelp: Record<SummaryTemplate, string> = {
  detailed: "Comprehensive notes with sections and key takeaways.",
  cheat_sheet: "Concise bullet points for quick revision.",
  short: "Only the essentials: a few bullets and the main idea.",
};

export const summaryLanguages = [
  "English",
  "Vietnamese",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Japanese",
  "Korean",
  "Chinese",
] as const;

interface RangeRow {
  key: number;
  start: string;
  end: string;
}

/** Turns the typed rows into ranges, or says which row to fix. */
function toRanges(
  rows: RangeRow[],
  bounds: SourceBounds,
): { ranges: SummaryRange[]; error: string | null } {
  const ranges: SummaryRange[] = [];
  for (const [i, row] of rows.entries()) {
    const label = `Range ${i + 1}`;
    if (bounds.locatorType === "time") {
      const startSec = parseTimeInput(row.start);
      const endSec = parseTimeInput(row.end);
      if (startSec === null || endSec === null) {
        return { ranges, error: `${label}: enter times like 01:46 or 1:02:03.` };
      }
      if (endSec <= startSec)
        return { ranges, error: `${label}: the end must be after the start.` };
      ranges.push({ type: "time", startSec, endSec });
    } else {
      const startPage = Number(row.start);
      const endPage = Number(row.end);
      if (
        !Number.isInteger(startPage) ||
        !Number.isInteger(endPage) ||
        startPage < 1 ||
        endPage < 1
      ) {
        return { ranges, error: `${label}: enter whole page numbers, 1 or higher.` };
      }
      if (endPage < startPage)
        return { ranges, error: `${label}: the last page must not come before the first.` };
      if (bounds.pageCount !== null && startPage > bounds.pageCount) {
        return { ranges, error: `${label}: this document has ${bounds.pageCount} pages.` };
      }
      ranges.push({ type: "page", startPage, endPage });
    }
  }
  return { ranges, error: null };
}

export function GenerateSummaryDialog({
  open,
  onClose,
  bounds,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  bounds: SourceBounds;
  /** Returns an error message, or null when the summary started. */
  onSubmit: (input: SummaryOptionsInput) => Promise<string | null>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Generate summary">
      <GenerateForm onClose={onClose} bounds={bounds} onSubmit={onSubmit} />
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so every open starts with a fresh form. */
function GenerateForm({
  onClose,
  bounds,
  onSubmit,
}: {
  onClose: () => void;
  bounds: SourceBounds;
  onSubmit: (input: SummaryOptionsInput) => Promise<string | null>;
}) {
  const [template, setTemplate] = useState<SummaryTemplate>("detailed");
  const [language, setLanguage] = useState("English");
  const [customPrompt, setCustomPrompt] = useState("");
  const [rows, setRows] = useState<RangeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canRange = bounds.locatorType === "time" || bounds.locatorType === "page";
  const isTime = bounds.locatorType === "time";
  const sourceSize = isTime
    ? `This video is ${formatClock(bounds.durationSec ?? 0)} long.`
    : `This document has ${bounds.pageCount ?? 0} pages.`;

  const updateRow = (key: number, patch: Partial<RangeRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function submit() {
    const { ranges, error: rangeError } = toRanges(rows, bounds);
    if (rangeError) return setError(rangeError);
    setPending(true);
    setError(null);
    const message = await onSubmit({
      template,
      language,
      ranges,
      ...(customPrompt.trim() ? { customPrompt } : {}),
    });
    setPending(false);
    if (message) setError(message);
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 field__label">Template</legend>
        {summaryTemplates.map((t) => (
          <label
            key={t}
            className="flex cursor-pointer gap-3 rounded-lg border border-border-subtle bg-surface-200 p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-tint"
          >
            <input
              type="radio"
              name="template"
              value={t}
              checked={template === t}
              onChange={() => setTemplate(t)}
              className="mt-1 accent-accent"
            />
            <span className="flex flex-col">
              <span className="type-label text-ink">{summaryTemplateLabels[t]}</span>
              <span className="type-caption text-ink-muted">{templateHelp[t]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {canRange && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 field__label">{isTime ? "Time ranges" : "Page ranges"}</legend>
          <p className="type-caption text-ink-muted">
            {rows.length === 0
              ? "The whole source is summarised."
              : "Only these parts are summarised."}{" "}
            {sourceSize}
          </p>
          {rows.map((row, i) => (
            <div key={row.key} className="flex items-center gap-2">
              <input
                className="field__input w-full min-w-0"
                aria-label={`Range ${i + 1} ${isTime ? "start time" : "first page"}`}
                placeholder={isTime ? "Start, 01:46" : "First page"}
                inputMode={isTime ? "text" : "numeric"}
                value={row.start}
                onChange={(e) => updateRow(row.key, { start: e.target.value })}
              />
              <span className="text-ink-muted" aria-hidden="true">
                to
              </span>
              <input
                className="field__input w-full min-w-0"
                aria-label={`Range ${i + 1} ${isTime ? "end time" : "last page"}`}
                placeholder={isTime ? "End, 28:22" : "Last page"}
                inputMode={isTime ? "text" : "numeric"}
                value={row.end}
                onChange={(e) => updateRow(row.key, { end: e.target.value })}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove range ${i + 1}`}
                onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              >
                Remove
              </Button>
            </div>
          ))}
          {rows.length < 10 && (
            <Button
              size="sm"
              className="w-fit"
              onClick={() =>
                setRows((rs) => [...rs, { key: (rs.at(-1)?.key ?? 0) + 1, start: "", end: "" }])
              }
            >
              {rows.length === 0 ? "Choose a range" : "Add another range"}
            </Button>
          )}
        </fieldset>
      )}

      <div className="field max-w-none">
        <label htmlFor="summary-language" className="field__label">
          Language
        </label>
        <Select
          id="summary-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full"
        >
          {summaryLanguages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      <div className="field max-w-none">
        <label htmlFor="summary-prompt" className="field__label">
          Custom instructions (optional)
        </label>
        <textarea
          id="summary-prompt"
          rows={3}
          maxLength={1000}
          className="field__input h-auto min-h-20 py-2"
          placeholder="For example, focus on definitions I could be asked in an exam"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
        />
      </div>

      <p role="alert" className={cx("type-caption text-danger", !error && "hidden")}>
        {error}
      </p>

      <div className="modal__actions mt-0">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Starting" : "Generate summary"}
        </Button>
      </div>
    </form>
  );
}
