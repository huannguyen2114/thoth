"use client";

import type { BoardElement } from "@thoth/core";
import { Button, CancelButton, cx, Dialog } from "@thoth/ui";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Command, useCommands } from "@/app/_components/commands";
import type { LearnTool, LearnToolProps } from "@/features/learn-panel/types";
import {
  type BoardSummaryDto,
  createBoardAction,
  deleteBoardAction,
  listBoardsAction,
  renameBoardAction,
  startMindMapAction,
} from "./actions";
import { BoardCanvas } from "./canvas";
import { Composer } from "./composer";
import type { RunKind } from "./runs";
import { SourcePicker } from "./source-picker";
import { type SaveState, useBoard } from "./use-board";
import "./whiteboard.css";

const saveLabel: Record<SaveState, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
};

/** Room the composer takes at the bottom of the canvas. */
const COMPOSER_INSET = 88;

function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

function Chevron() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/** The board switcher: the open board's name, opening a Hearth Menu of every board. */
function BoardMenu({
  boards,
  openId,
  onOpen,
  onNew,
  onRename,
  onDelete,
}: {
  boards: BoardSummaryDto[];
  openId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = boards.find((b) => b.id === openId);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const item = (key: string, label: ReactNode, run: () => void, extra?: string) => (
    <button
      key={key}
      type="button"
      role="menuitem"
      className={cx("menu__item", extra)}
      onClick={() => {
        close();
        run();
      }}
    >
      {label}
    </button>
  );

  return (
    <div ref={root} className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 min-w-0 max-w-full items-center gap-1 rounded-md px-2 text-left text-ink hover:bg-surface-300"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate type-heading-3">{current?.title ?? "Whiteboard"}</span>
        <span className="shrink-0 text-ink-muted">
          <Chevron />
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Boards"
          className="menu absolute left-0 top-full z-20 mt-1 max-h-96 overflow-y-auto"
          onKeyDown={(e) => {
            const items = [
              ...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
            ];
            const i = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === "Escape") close();
            else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
            }
          }}
        >
          {boards.map((b) =>
            item(
              b.id,
              <>
                <span className={cx("min-w-0 flex-1 truncate", b.id === openId && "type-label")}>
                  {b.title}
                </span>
                <kbd>{b.running ? "Drawing…" : `${b.count}`}</kbd>
              </>,
              () => onOpen(b.id),
            ),
          )}
          {boards.length > 0 && <hr className="menu__sep border-0" />}
          {item("new", "New board", onNew)}
          {current && item("rename", "Rename board…", onRename)}
          {current && item("delete", "Delete board…", onDelete, "menu__item--danger")}
        </div>
      )}
    </div>
  );
}

/** One open board: header status, the canvas, the composer and the source picker. */
function OpenBoard({
  boardId,
  contentId,
  onCite,
  initialRun,
  header,
  onTouched,
}: {
  boardId: string;
  contentId: string;
  onCite?: ((token: string) => void) | undefined;
  initialRun: { id: string; kind: RunKind } | null;
  header: ReactNode;
  onTouched: () => void;
}) {
  const state = useBoard(boardId, initialRun);
  const phone = usePhone();
  const [selected, setSelected] = useState<string[]>([]);
  const [linking, setLinking] = useState<string[] | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  // A finished run changes the board list (counts, "Drawing…").
  const running = Boolean(state.run);
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) onTouched();
    wasRunning.current = running;
  }, [running, onTouched]);

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "wb-ask",
        group: "Whiteboard",
        label: "Ask Claude on the whiteboard",
        keywords: ["draw", "explain", "board"],
        run: () => composer.current?.focus(),
      },
    ],
    [],
  );
  useCommands("Whiteboard board", commands);

  const link = (token: string) => {
    const ids = new Set(linking ?? []);
    state.change((els) =>
      els.map((e) =>
        ids.has(e.id) ? ({ ...e, source: { contentId, token } } as BoardElement) : e,
      ),
    );
    setLinking(null);
  };
  const linkingCurrent = useMemo(() => {
    const tokens = new Set(
      state.elements.filter((e) => linking?.includes(e.id)).map((e) => e.source?.token ?? ""),
    );
    return tokens.size === 1 ? [...tokens][0] || null : null;
  }, [linking, state.elements]);

  const status = state.run
    ? state.run.kind === "mindmap"
      ? "Generating"
      : "Claude is drawing"
    : saveLabel[state.saveState];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
        {header}
        <p
          role="status"
          className={cx(
            "type-caption select-none",
            state.saveState === "error" ? "text-danger" : "text-ink-muted",
          )}
        >
          {status}
        </p>
      </div>
      {state.saveError && (
        <p role="alert" className="type-caption text-danger">
          {state.saveError}
        </p>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border-subtle">
        {state.loadError ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <p className="type-heading-3 text-ink">This board did not load</p>
              <p className="mt-1 text-ink-muted">{state.loadError}</p>
            </div>
          </div>
        ) : !state.board ? (
          <div className="h-full animate-pulse bg-surface-300" aria-hidden="true" />
        ) : (
          <>
            <BoardCanvas
              state={state}
              selected={selected}
              setSelected={setSelected}
              readOnly={phone}
              onCite={onCite}
              contentId={contentId}
              bottomInset={COMPOSER_INSET}
              onLinkSource={(ids) => setLinking(ids)}
            />
            {state.run?.kind === "mindmap" && state.elements.length === 0 && <MindMapSkeleton />}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3">
              <div className="pointer-events-auto">
                <Composer
                  ref={composer}
                  run={state.run}
                  notice={state.notice}
                  selectedCount={selected.length}
                  onAsk={(request) => state.ask(request, selected)}
                  onStop={() => void state.stop()}
                  onDismiss={state.dismissNotice}
                />
              </div>
            </div>
          </>
        )}
      </div>
      {linking && (
        <SourcePicker
          contentId={contentId}
          current={linkingCurrent}
          onPick={link}
          onClose={() => setLinking(null)}
        />
      )}
    </div>
  );
}

/** Shaped like the tree that is coming: a root, branches, leaves. */
function MindMapSkeleton() {
  const leaves = [0, 1, 2, 3, 4, 5];
  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center"
      aria-hidden="true"
    >
      <div className="relative h-64 w-96 max-w-full animate-pulse">
        <div className="wb-skeleton left-0 top-28 h-10 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="wb-skeleton left-36 h-8 w-24" style={{ top: 32 + i * 80 }} />
        ))}
        {leaves.map((i) => (
          <div key={i} className="wb-skeleton left-72 h-6 w-20" style={{ top: 12 + i * 40 }} />
        ))}
      </div>
    </div>
  );
}

function WhiteboardPanel({ contentId, onCite }: LearnToolProps) {
  const [boards, setBoards] = useState<BoardSummaryDto[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [initialRun, setInitialRun] = useState<{ id: string; kind: RunKind } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askingMap, setAskingMap] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listBoardsAction(contentId);
    setBoards(list);
    return list;
  }, [contentId]);

  useEffect(() => {
    let cancelled = false;
    listBoardsAction(contentId)
      .then((list) => {
        if (cancelled) return;
        setBoards(list);
        const first = list[0];
        if (first) {
          setOpenId(first.id);
          setInitialRun(first.running);
        }
      })
      .catch(() => !cancelled && setError("Could not load your boards. Reload the page."));
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  const open = (id: string) => {
    setOpenId(id);
    setInitialRun(boards?.find((b) => b.id === id)?.running ?? null);
  };

  async function newBoard() {
    setBusy(true);
    const r = await createBoardAction(contentId);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    await refresh();
    setInitialRun(null);
    setOpenId(r.value.id);
  }

  async function mindMap(focus: string) {
    setBusy(true);
    const r = await startMindMapAction(contentId, focus);
    setBusy(false);
    setAskingMap(false);
    if (!r.ok) return setError(r.error);
    await refresh();
    setInitialRun({ id: r.value.runId, kind: "mindmap" });
    setOpenId(r.value.board.id);
  }

  async function rename(title: string) {
    if (!openId) return;
    const r = await renameBoardAction(openId, title);
    if (!r.ok) return setError(r.error);
    setRenaming(false);
    await refresh();
  }

  async function remove() {
    if (!openId) return;
    const r = await deleteBoardAction(openId);
    setDeleting(false);
    if (!r.ok) return setError(r.error);
    const list = await refresh();
    setInitialRun(list[0]?.running ?? null);
    setOpenId(list[0]?.id ?? null);
  }

  const newBoardRef = useRef(newBoard);
  newBoardRef.current = newBoard;
  const panelCommands = useMemo<Command[]>(
    () => [
      {
        id: "wb-new",
        group: "Whiteboard",
        label: "New whiteboard",
        run: () => void newBoardRef.current(),
      },
      {
        id: "wb-mindmap",
        group: "Whiteboard",
        label: "Make a mind map",
        keywords: ["whiteboard", "concept map"],
        run: () => setAskingMap(true),
      },
    ],
    [],
  );
  useCommands("Whiteboard panel", panelCommands);

  if (error && !boards) {
    return (
      <div className="callout callout--danger" role="alert">
        <div>
          <p className="callout__title">Boards did not load</p>
          <p className="callout__text">{error}</p>
        </div>
      </div>
    );
  }
  if (!boards) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />;
  }

  const current = boards.find((b) => b.id === openId);
  const header = (
    <>
      <BoardMenu
        boards={boards}
        openId={openId}
        onOpen={open}
        onNew={() => void newBoard()}
        onRename={() => setRenaming(true)}
        onDelete={() => setDeleting(true)}
      />
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setAskingMap(true)} disabled={busy}>
          Mind map
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void newBoard()} disabled={busy}>
          New board
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-96 flex-col">
      {error && (
        <p role="alert" className="mb-2 type-caption text-danger">
          {error}
        </p>
      )}
      {openId ? (
        <OpenBoard
          key={openId}
          boardId={openId}
          contentId={contentId}
          onCite={onCite}
          initialRun={initialRun}
          header={header}
          onTouched={() => void refresh()}
        />
      ) : (
        <div className="grid flex-1 place-items-center rounded-lg border border-border-subtle bg-surface-200 p-6 text-center">
          <div className="max-w-sm">
            <h3 className="type-heading-3 text-ink">No boards yet</h3>
            <p className="mt-1 text-ink-muted">
              Let Claude map the chapters, or start a blank board and ask it to explain something.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => setAskingMap(true)} disabled={busy}>
                Make a mind map
              </Button>
              <Button variant="secondary" onClick={() => void newBoard()} disabled={busy}>
                New board
              </Button>
            </div>
          </div>
        </div>
      )}

      {askingMap && (
        <MindMapDialog busy={busy} onStart={mindMap} onClose={() => setAskingMap(false)} />
      )}
      {renaming && current && (
        <RenameDialog title={current.title} onSave={rename} onClose={() => setRenaming(false)} />
      )}
      {deleting && current && (
        <Dialog
          title="Delete this board?"
          onClose={() => setDeleting(false)}
          actions={
            <>
              <CancelButton onClick={() => setDeleting(false)} />
              <Button variant="danger" onClick={() => void remove()}>
                Delete board
              </Button>
            </>
          }
        >
          <p className="text-ink-muted">
            “{current.title}” and everything on it will be removed. This cannot be undone.
          </p>
        </Dialog>
      )}
    </div>
  );
}

function MindMapDialog({
  busy,
  onStart,
  onClose,
}: {
  busy: boolean;
  onStart: (focus: string) => void;
  onClose: () => void;
}) {
  const [focus, setFocus] = useState("");
  return (
    <Dialog title="Make a mind map" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(focus);
        }}
      >
        <p className="text-ink-muted">
          Claude maps the main ideas, and every node links to its place in the source.
        </p>
        <label className="field">
          <span className="field__label">Focus (optional)</span>
          <input
            className="field__input"
            value={focus}
            maxLength={200}
            autoFocus
            placeholder="The whole source"
            onChange={(e) => setFocus(e.target.value)}
          />
          <span className="field__help">For example: one chapter, or a question you have.</span>
        </label>
        <div className="modal__actions">
          <CancelButton onClick={onClose} />
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Starting" : "Make mind map"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameDialog({
  title,
  onSave,
  onClose,
}: {
  title: string;
  onSave: (t: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(title);
  return (
    <Dialog title="Rename board" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(value);
        }}
      >
        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="field__input"
            value={value}
            maxLength={120}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="modal__actions">
          <CancelButton onClick={onClose} />
          <Button type="submit" variant="primary" disabled={!value.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export const whiteboardTool: LearnTool = {
  id: "whiteboard",
  label: "Whiteboard",
  description: "Claude draws an explanation or a mind map you can edit.",
  Panel: WhiteboardPanel,
};
