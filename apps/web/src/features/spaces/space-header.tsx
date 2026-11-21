"use client";

import { type AccentColor, type SpaceIcon as SpaceIconName, spaceIcons } from "@thoth/core";
import { Button, CancelButton, cx, Dialog } from "@thoth/ui";
import { useState, useTransition } from "react";
import { ColorPicker } from "@/features/library/tags";
import { updateSpaceAction } from "./actions";
import { SpaceIcon, spaceIconLabels } from "./space-icon";

export interface SpaceHeaderData {
  id: string;
  name: string;
  description: string | null;
  color: AccentColor | null;
  icon: SpaceIconName | null;
}

/** The space's title row: its icon in its colour, name, description, and Customise (doc 22). */
export function SpaceHeader({ space }: { space: SpaceHeaderData }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="flex items-start gap-3">
      <span className="mt-2 shrink-0" aria-hidden="true">
        <SpaceIcon icon={space.icon} color={space.color} size={24} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="type-overline text-ink-muted">Space</p>
        <h1 className="truncate type-display-lg text-ink">{space.name}</h1>
        {space.description && <p className="text-ink-muted">{space.description}</p>}
      </div>
      <Button size="sm" variant="ghost" className="mt-2 shrink-0" onClick={() => setOpen(true)}>
        Customise
      </Button>
      {open && <CustomiseDialog space={space} onClose={() => setOpen(false)} />}
    </header>
  );
}

function CustomiseDialog({ space, onClose }: { space: SpaceHeaderData; onClose: () => void }) {
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description ?? "");
  const [color, setColor] = useState<AccentColor>(space.color ?? "orange");
  const [icon, setIcon] = useState<SpaceIconName | null>(space.icon);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await updateSpaceAction(space.id, {
        name,
        description: description.trim() || null,
        color,
        icon,
      });
      if (!r.ok) return setError(r.error);
      onClose();
    });

  return (
    <Dialog
      title="Customise space"
      onClose={onClose}
      actions={
        <>
          <CancelButton onClick={onClose} />
          <Button variant="primary" onClick={save} disabled={pending || !name.trim()}>
            {pending ? "Saving" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="field max-w-none">
          <span className="field__label">Name</span>
          <input
            className="field__input"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field max-w-none">
          <span className="field__label">Description (optional)</span>
          <input
            className="field__input"
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="field max-w-none">
          <span className="field__label">Colour</span>
          <ColorPicker label="Space colour" value={color} onChange={setColor} />
        </div>
        <div className="field max-w-none">
          <span className="field__label">Icon</span>
          <fieldset className="flex flex-wrap gap-1">
            <legend className="sr-only">Space icon</legend>
            {spaceIcons.map((i) => (
              <label
                key={i}
                title={spaceIconLabels[i]}
                className={cx(
                  "icon-choice grid size-10 place-items-center rounded-md border",
                  icon === i
                    ? "border-ink bg-surface-300"
                    : "border-transparent hover:bg-surface-300",
                )}
              >
                <input
                  type="radio"
                  name="space-icon"
                  className="sr-only"
                  checked={icon === i}
                  aria-label={spaceIconLabels[i]}
                  onChange={() => setIcon(i)}
                />
                <SpaceIcon icon={i} color={color} size={20} />
              </label>
            ))}
          </fieldset>
        </div>
        {error && (
          <p role="alert" className="type-caption text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
