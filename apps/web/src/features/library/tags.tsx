"use client";

import { type AccentColor, accentColors, type Tag } from "@thoth/core";
import { Button, CancelButton, Dialog } from "@thoth/ui";
import { useRouter } from "next/navigation";
import { type DragEvent, type ReactNode, useId, useMemo, useState, useTransition } from "react";
import {
  createTagAction,
  deleteTagAction,
  setContentTagsAction,
  updateTagAction,
} from "@/features/spaces/actions";
import { startContentDrag } from "@/features/spaces/drag";
import "@/features/spaces/accents.css";

/** Tags on contents (doc 22): chips, the library filter, and the per-content tag dialog. */

export function TagChip({
  tag,
  pressed,
  onClick,
}: {
  tag: Pick<Tag, "name" | "color">;
  pressed?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="accent-dot" aria-hidden="true" />
      <span className="type-caption truncate">{tag.name}</span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      data-accent={tag.color}
      className="tag-chip"
      aria-pressed={pressed ?? false}
      onClick={onClick}
    >
      {body}
    </button>
  ) : (
    <span data-accent={tag.color} className="tag-chip">
      {body}
    </span>
  );
}

export interface TaggedItem {
  id: string;
  title: string;
  tagIds: string[];
  /** The row, rendered on the server. */
  node: ReactNode;
}

/**
 * A list of rows with tag filter chips above it. Selecting chips keeps rows that carry every
 * selected tag. Rows can be dragged onto a space in the sidebar.
 */
export function TagFilteredList({ tags, items }: { tags: Tag[]; items: TaggedItem[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const used = useMemo(() => {
    const ids = new Set(items.flatMap((i) => i.tagIds));
    return tags.filter((t) => ids.has(t.id));
  }, [tags, items]);
  const shown = items.filter((i) => selected.every((t) => i.tagIds.includes(t)));
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="flex flex-col gap-3">
      {used.length > 0 && (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Filter by tag</legend>
          {used.map((t) => (
            <TagChip
              key={t.id}
              tag={t}
              pressed={selected.includes(t.id)}
              onClick={() => toggle(t.id)}
            />
          ))}
          {selected.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          )}
        </fieldset>
      )}
      {shown.length === 0 ? (
        <p className="text-ink-muted">Nothing has all of these tags.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
          {shown.map((i) => (
            <li
              key={i.id}
              draggable
              onDragStart={(e: DragEvent) => startContentDrag(e, i.id, i.title)}
            >
              {i.node}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const colorLabel = (c: AccentColor) => c[0]?.toUpperCase() + c.slice(1);

export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: AccentColor;
  onChange: (c: AccentColor) => void;
  label: string;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-wrap gap-1">
      <legend className="sr-only">{label}</legend>
      {accentColors.map((c) => (
        <label key={c} title={colorLabel(c)} data-accent={c} className="accent-swatch">
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={value === c}
            aria-label={colorLabel(c)}
            onChange={() => onChange(c)}
          />
        </label>
      ))}
    </fieldset>
  );
}

/** "Tags" on a content row: opens a dialog to tick tags, create new ones, rename or recolour. */
export function TagButton({
  contentId,
  title,
  assigned,
  all,
}: {
  contentId: string;
  title: string;
  assigned: Tag[];
  all: Tag[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`Tags for ${title}`}
      >
        Tags
      </Button>
      {open && (
        <TagDialog
          contentId={contentId}
          title={title}
          assigned={assigned}
          all={all}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TagDialog({
  contentId,
  title,
  assigned,
  all,
  onClose,
}: {
  contentId: string;
  title: string;
  assigned: Tag[];
  all: Tag[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>(all);
  const [chosen, setChosen] = useState<string[]>(assigned.map((t) => t.id));
  const [name, setName] = useState("");
  const [color, setColor] = useState<AccentColor>("blue");
  const [editing, setEditing] = useState<Tag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const r = await createTagAction(name, color);
      if (!r.ok) return setError(r.error);
      setError(null);
      setName("");
      setTags((t) => (t.some((x) => x.id === r.value.id) ? t : [...t, r.value]));
      setChosen((c) => (c.includes(r.value.id) ? c : [...c, r.value.id]));
    });

  const saveEdit = () =>
    start(async () => {
      if (!editing) return;
      const r = await updateTagAction(editing.id, editing.name, editing.color);
      if (!r.ok) return setError(r.error);
      setError(null);
      setTags((t) => t.map((x) => (x.id === r.value.id ? r.value : x)));
      setEditing(null);
    });

  const remove = (tag: Tag) =>
    start(async () => {
      const r = await deleteTagAction(tag.id);
      if (!r.ok) return setError(r.error);
      setTags((t) => t.filter((x) => x.id !== tag.id));
      setChosen((c) => c.filter((x) => x !== tag.id));
      setEditing(null);
    });

  const save = () =>
    start(async () => {
      const r = await setContentTagsAction(contentId, chosen);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onClose();
    });

  return (
    <Dialog
      title={`Tags for ${title}`}
      onClose={onClose}
      actions={
        <>
          <CancelButton onClick={onClose} />
          <Button variant="primary" onClick={save} disabled={pending}>
            {pending ? "Saving" : "Save tags"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {tags.length === 0 ? (
          <p className="text-ink-muted">No tags yet. Create the first one below.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {[...tags]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) =>
                editing?.id === t.id ? (
                  <li key={t.id} className="flex flex-col gap-2 py-2">
                    <input
                      className="field__input"
                      aria-label="Tag name"
                      value={editing.name}
                      maxLength={40}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                    <ColorPicker
                      label="Tag colour"
                      value={editing.color}
                      onChange={(c) => setEditing({ ...editing, color: c })}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={saveEdit} disabled={pending}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-danger"
                        onClick={() => remove(t)}
                        disabled={pending}
                      >
                        Delete tag
                      </Button>
                    </div>
                  </li>
                ) : (
                  <li key={t.id} className="flex min-h-11 items-center gap-3 py-1">
                    <label className="check min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={chosen.includes(t.id)}
                        onChange={(e) =>
                          setChosen((c) =>
                            e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id),
                          )
                        }
                      />
                      <TagChip tag={t} />
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(t)}
                      aria-label={`Edit tag ${t.name}`}
                    >
                      Edit
                    </Button>
                  </li>
                ),
              )}
          </ul>
        )}
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add();
          }}
        >
          <label className="field max-w-none">
            <span className="field__label">New tag</span>
            <div className="flex gap-2">
              <input
                className="field__input flex-1"
                value={name}
                maxLength={40}
                placeholder="For example, exam 1"
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" disabled={!name.trim() || pending}>
                Add
              </Button>
            </div>
          </label>
          <ColorPicker label="New tag colour" value={color} onChange={setColor} />
        </form>
        {error && (
          <p role="alert" className="type-caption text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
