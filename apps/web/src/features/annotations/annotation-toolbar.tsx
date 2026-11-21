"use client";

import type { AnnotationColor, BacklinkSource } from "@thoth/core";
import { Button, cx } from "@thoth/ui";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AnnotationDto } from "./actions";
import { COLOR_NAMES, COLORS } from "./colors";
import { CardIcon, CloseIcon, CommentIcon, NoteIcon, TrashIcon } from "./icons";

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PassageActions {
  /** Highlight in a colour (a new selection), or change the colour (an annotation). */
  onColor?: ((c: AnnotationColor) => void) | undefined;
  /** Save a comment. A new selection becomes a highlight with that comment. */
  onComment?: ((text: string) => void) | undefined;
  onAddToNotes: () => void;
  /** Resolves to a status line ("Added to From highlights") or an error. */
  onFlashcard: (suggest: boolean) => Promise<{ ok: boolean; message: string }>;
  onDelete?: (() => void) | undefined;
}

const GAP = 8;

/**
 * The floating bar over a selected passage or a clicked annotation (doc 21): colours, Comment,
 * Add to notes, Make flashcard, and for an annotation Delete and the notes that quote it.
 * Rendered in a portal so dock panels never clip it. Buttons keep the text selection.
 */
export function AnnotationToolbar({
  anchor,
  current,
  actions,
  quotedIn,
  onOpenBacklink,
  onClose,
  startCommenting = false,
}: {
  anchor: AnchorRect;
  /** The annotation clicked, or null for a fresh selection. */
  current?: AnnotationDto | null | undefined;
  actions: PassageActions;
  /** Notes that link to this annotation. */
  quotedIn?: BacklinkSource[] | undefined;
  onOpenBacklink?: ((s: BacklinkSource) => void) | undefined;
  onClose: () => void;
  /** Open with the comment box showing (a new comment pin). */
  startCommenting?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [commenting, setCommenting] = useState(startCommenting);
  const [draft, setDraft] = useState(current?.comment ?? "");
  const [cardMenu, setCardMenu] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Above the passage when there is room, else below; never off screen. Re-measured when the
  // bar grows (comment box, card menu, status line).
  // biome-ignore lint/correctness/useExhaustiveDependencies: the extra deps change the bar's size
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(
      GAP,
      Math.min(anchor.left + anchor.width / 2 - w / 2, window.innerWidth - w - GAP),
    );
    const above = anchor.top - h - GAP;
    const top =
      above >= GAP
        ? above
        : Math.min(anchor.top + anchor.height + GAP, window.innerHeight - h - GAP);
    setPos({ left, top });
  }, [anchor, commenting, cardMenu, status, quotedIn?.length]);

  // Close on a press outside, or Escape inside.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    // Next tick: the press that opened the bar must not close it.
    const t = window.setTimeout(() => document.addEventListener("pointerdown", onDown), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  const keep = (e: { preventDefault(): void }) => e.preventDefault();

  async function card(suggest: boolean) {
    setCardMenu(false);
    setBusy(true);
    setStatus({ ok: true, message: suggest ? "Asking Claude for a question…" : "Making a card…" });
    const r = await actions.onFlashcard(suggest);
    setBusy(false);
    setStatus(r);
  }

  const activeColor = current?.color;
  const hasComment = Boolean(current?.comment);

  return createPortal(
    <div
      ref={box}
      role="toolbar"
      aria-label={current ? "Annotation" : "Selected text"}
      className={cx(
        "fixed z-50 flex max-w-sm flex-col gap-2 rounded-lg border border-border-subtle bg-surface-200 p-1.5 shadow-hearth-md",
        !pos && "invisible",
      )}
      style={pos ?? { left: 0, top: 0 }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        {actions.onColor && (
          <fieldset className="m-0 flex items-center gap-0.5 border-0 p-0">
            <legend className="sr-only">Highlight colour</legend>
            {COLOR_NAMES.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={keep}
                onClick={() => actions.onColor?.(c)}
                aria-label={current ? `Colour ${COLORS[c].label}` : `Highlight ${COLORS[c].label}`}
                aria-pressed={activeColor === c}
                title={COLORS[c].label}
                className="grid size-8 place-items-center rounded-md transition-colors duration-150 hover:bg-surface-300 pointer-coarse:size-11"
              >
                <span
                  className={cx(
                    "size-4 rounded-pill",
                    COLORS[c].swatch,
                    activeColor === c && "ring-2 ring-ink ring-offset-2 ring-offset-surface-200",
                  )}
                />
              </button>
            ))}
          </fieldset>
        )}
        {actions.onColor && (
          <span className="mx-0.5 h-5 w-px bg-border-subtle" aria-hidden="true" />
        )}
        {actions.onComment && (
          <ToolButton
            label={hasComment ? "Edit comment" : "Comment"}
            icon={<CommentIcon />}
            pressed={commenting}
            onClick={() => setCommenting((v) => !v)}
          />
        )}
        <ToolButton label="Add to notes" icon={<NoteIcon />} onClick={actions.onAddToNotes} />
        <div className="relative">
          <ToolButton
            label="Make flashcard"
            icon={<CardIcon />}
            pressed={cardMenu}
            disabled={busy}
            onClick={() => setCardMenu((v) => !v)}
          />
        </div>
        {actions.onDelete && (
          <ToolButton label="Delete" icon={<TrashIcon />} onClick={actions.onDelete} iconOnly />
        )}
        <ToolButton label="Close" icon={<CloseIcon />} onClick={onClose} iconOnly />
      </div>

      {cardMenu && (
        <div className="flex flex-col" role="menu" aria-label="Make flashcard">
          <button
            type="button"
            role="menuitem"
            className="menu__item h-9 rounded-md"
            onMouseDown={keep}
            onClick={() => void card(false)}
          >
            Fill-in-the-blank card
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu__item h-9 rounded-md"
            onMouseDown={keep}
            onClick={() => void card(true)}
          >
            Ask Claude for a question
          </button>
        </div>
      )}

      {current?.comment && !commenting && (
        <p className="type-body max-h-40 overflow-y-auto px-1.5 whitespace-pre-line text-ink select-text">
          {current.comment}
        </p>
      )}

      {commenting && actions.onComment && (
        <form
          className="flex flex-col gap-2 px-1 pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            actions.onComment?.(draft);
            setCommenting(false);
          }}
        >
          <textarea
            // biome-ignore lint/a11y/noAutofocus: the owner just asked to write a comment
            autoFocus
            aria-label="Comment"
            className="field__input h-auto min-h-20 w-full resize-y py-2"
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                actions.onComment?.(draft);
                setCommenting(false);
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCommenting(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              type="submit"
              disabled={!draft.trim() && !hasComment}
            >
              Save comment
            </Button>
          </div>
        </form>
      )}

      {quotedIn && quotedIn.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-border-subtle px-1 pt-1.5">
          <p className="type-caption px-1 text-ink-muted select-none">
            Quoted in {quotedIn.length} {quotedIn.length === 1 ? "note" : "notes"}
          </p>
          {quotedIn.map((s) => (
            <button
              key={`${s.fromKind}-${s.fromId}-${s.href}`}
              type="button"
              className="menu__item h-8 rounded-md"
              onClick={() => onOpenBacklink?.(s)}
            >
              <NoteIcon />
              <span className="truncate">{ownerName(s)}</span>
            </button>
          ))}
        </div>
      )}

      {status && (
        <p
          role="status"
          className={cx("type-caption px-1.5 pb-0.5", status.ok ? "text-ink-muted" : "text-danger")}
        >
          {status.message}
        </p>
      )}
    </div>,
    document.body,
  );
}

export function ownerName(s: BacklinkSource): string {
  if (s.owner.kind === "content") return `Notes on ${s.owner.title}`;
  if (s.owner.kind === "space") return `${s.owner.name} notes`;
  return "A note";
}

function ToolButton({
  label,
  icon,
  onClick,
  pressed,
  disabled,
  iconOnly,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={iconOnly ? label : undefined}
      aria-pressed={pressed}
      title={label}
      className={cx(
        "type-label flex h-8 items-center gap-1.5 rounded-md px-2 text-ink-muted transition-colors duration-150 hover:bg-surface-300 hover:text-ink disabled:opacity-50 pointer-coarse:h-11",
        pressed && "bg-surface-300 text-ink",
      )}
    >
      {icon}
      {!iconOnly && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}
