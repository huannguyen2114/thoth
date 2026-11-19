"use client";

import type { PlanId } from "@thoth/core";
import { Button, CancelButton, cx, Dialog, Select } from "@thoth/ui";
import { useState } from "react";
import { createPlanAction } from "./actions";
import { addDaysTo, todayLocal, tzOffset } from "./format";

export interface PlannerSpace {
  id: string;
  name: string;
}
export interface PlannerContent {
  id: string;
  title: string;
  spaceId: string | null;
}

const DAY_CHIPS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 0, label: "Sun" },
];

/** "New study plan": pick what to study, the goal date, the daily budget and the study days. */
export function NewPlanDialog({
  spaces,
  contents,
  onClose,
  onCreated,
}: {
  spaces: PlannerSpace[];
  contents: PlannerContent[];
  onClose: () => void;
  onCreated: (id: PlanId) => void;
}) {
  const firstSpace = spaces.find((s) => contents.some((c) => c.spaceId === s.id));
  const [scope, setScope] = useState<string>(firstSpace?.id ?? "custom");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState(firstSpace ? `${firstSpace.name} plan` : "Study plan");
  const [titleEdited, setTitleEdited] = useState(false);
  const [goal, setGoal] = useState(() => addDaysTo(todayLocal(), 21));
  const [minutes, setMinutes] = useState("45");
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6]));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inScope =
    scope === "custom"
      ? contents.filter((c) => picked.has(c.id))
      : contents.filter((c) => c.spaceId === scope);

  const toggle = <T,>(set: Set<T>, v: T, put: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    put(next);
  };

  return (
    <Dialog title="New study plan" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          const r = await createPlanAction(
            {
              title,
              goalDate: goal,
              minutesPerDay: Number(minutes),
              studyDays: [...days],
              spaceId: scope === "custom" ? null : scope,
              contentIds: inScope.map((c) => c.id),
            },
            tzOffset(),
          );
          setSaving(false);
          if (r.ok) onCreated(r.value.planId);
          else setError(r.error);
        }}
      >
        <div className="field max-w-none">
          <label className="field__label" htmlFor="plan-scope">
            What to study
          </label>
          <Select
            id="plan-scope"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              const space = spaces.find((s) => s.id === e.target.value);
              if (!titleEdited) setTitle(space ? `${space.name} plan` : "Study plan");
            }}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                Space: {s.name}
              </option>
            ))}
            <option value="custom">Choose contents…</option>
          </Select>
          {scope === "custom" ? (
            <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle p-2">
              {contents.map((c) => (
                <li key={c.id}>
                  <label className="check min-h-11 w-full">
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      onChange={() => toggle(picked, c.id, setPicked)}
                    />
                    <span className="truncate">{c.title}</span>
                  </label>
                </li>
              ))}
              {contents.length === 0 && <li className="text-ink-muted">No ready contents yet.</li>}
            </ul>
          ) : (
            <p className="field__help">
              {inScope.length} ready {inScope.length === 1 ? "content" : "contents"} in this space.
            </p>
          )}
        </div>

        <div className="field max-w-none">
          <label className="field__label" htmlFor="plan-title">
            Name
          </label>
          <input
            id="plan-title"
            className="field__input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleEdited(true);
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="field max-w-none">
            <label className="field__label" htmlFor="plan-goal">
              Goal date
            </label>
            <input
              id="plan-goal"
              className="field__input"
              type="date"
              min={addDaysTo(todayLocal(), 1)}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <div className="field max-w-none">
            <label className="field__label" htmlFor="plan-minutes">
              Minutes a day
            </label>
            <input
              id="plan-minutes"
              className="field__input"
              type="number"
              inputMode="numeric"
              min={10}
              max={600}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="field__label">Study days</legend>
          <div className="flex flex-wrap gap-2">
            {DAY_CHIPS.map((d) => (
              <button
                key={d.n}
                type="button"
                aria-pressed={days.has(d.n)}
                onClick={() => toggle(days, d.n, setDays)}
                className={cx(
                  "type-label h-11 min-w-12 rounded-pill border px-3 transition-colors duration-150",
                  days.has(d.n)
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border-control bg-surface-200 text-ink",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="callout callout--danger">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <CancelButton onClick={onClose} />
          <Button type="submit" variant="primary" disabled={saving || inScope.length === 0}>
            {saving ? "Planning" : "Create plan"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
