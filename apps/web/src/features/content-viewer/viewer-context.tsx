"use client";

import { type CitationRef, parseCitations } from "@thoth/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRegistry } from "@/app/_components/commands";
import { requestSetQuote } from "@/features/annotations/set-quote";
import { requestAnnotationFlash } from "@/features/annotations/store";

/**
 * What a source viewer can do. Each viewer registers one handle; citation chips, chapters
 * and the transcript call `jump`, which routes to the handle. Unsupported jumps (a page
 * citation on a video) are ignored.
 */
export interface ViewerHandle {
  seek?(sec: number): void;
  showPage?(page: number): void;
  showParagraph?(index: number): void;
  /** Scrolls to an annotation and flashes it. False when this viewer does not show it. */
  showAnnotation?(id: string): boolean;
  /** Finds a passage of the source text again (doc 21) and flashes it. False when not found. */
  showQuote?(quote: string, near: CitationRef | null): boolean;
}

/**
 * Where a link chip can send the viewer (Phase 10, doc 21): a citation, an annotation, a passage
 * of the source, or a passage of a summary. `near` is where to go when the exact spot is gone.
 */
export type JumpTarget =
  | { kind: "cite"; ref: CitationRef }
  | { kind: "annotation"; id: string; near: CitationRef | null }
  | { kind: "quote"; quote: string; near: CitationRef | null }
  | { kind: "set"; setId: string; quote?: string | undefined };

/** Where the reader is now: the playback time, or the page or paragraph in view. */
export type ViewerPosition = CitationRef | null;

interface ViewerActions {
  register(handle: ViewerHandle | null): void;
  jump(ref: CitationRef): void;
  /** A jump to an annotation, a quote or a summary passage, as well as a citation. */
  jumpTo(target: JumpTarget): void;
  /** Shows a workspace panel (`notes`, `summary`...) through its palette command. */
  showPanel(id: string): void;
  /** Accepts a raw token like "[p.5]" or "[03:21]" (the Learn tool `onCite` contract). */
  jumpToToken(token: string): void;
  setPosition(p: ViewerPosition): void;
}

// Two contexts: actions never change, position changes often (every half second while playing).
const ActionsContext = createContext<ViewerActions | null>(null);
const PositionContext = createContext<ViewerPosition>(null);

export function ViewerProvider({
  children,
  onJump,
}: {
  children: ReactNode;
  /**
   * Called on every jump, before it is applied: the workspace reveals the Source panel here,
   * reopening it if it was closed.
   */
  onJump?: () => void;
}) {
  const handle = useRef<ViewerHandle | null>(null);
  // A jump asked for while no viewer is mounted (the Source panel was closed): applied as
  // soon as the reopened viewer registers. Only the latest one is kept.
  const pending = useRef<CitationRef | JumpTarget | null>(null);
  const registry = useRegistry();
  const commands = useRef(registry.commands);
  commands.current = registry.commands;
  const onJumpRef = useRef(onJump);
  useEffect(() => {
    onJumpRef.current = onJump;
  }, [onJump]);
  const [position, setPosition] = useState<ViewerPosition>(null);

  const jump = useCallback((ref: CitationRef | JumpTarget) => {
    onJumpRef.current?.();
    const h = handle.current;
    if (h) apply(h, ref);
    else pending.current = ref;
  }, []);

  const showPanel = useCallback((id: string) => {
    commands.current.find((c) => c.id === `workspace.show.${id}`)?.run();
  }, []);

  const jumpTo = useCallback(
    (t: JumpTarget) => {
      if (t.kind === "cite") return jump(t.ref);
      if (t.kind === "set") {
        // A summary passage lives in the Summary panel, not the Source.
        showPanel("summary");
        requestSetQuote(t.setId, t.quote ?? null);
        return;
      }
      jump(t);
    },
    [jump, showPanel],
  );

  const actions = useMemo<ViewerActions>(
    () => ({
      register: (h) => {
        handle.current = h;
        if (!h || !pending.current) return;
        // Applied on the next tick, and only if this viewer is still the registered one: a
        // viewer can mount and unmount at once (React Strict Mode, a panel moved between
        // groups), and a jump handed to the one that left would be lost.
        window.setTimeout(() => {
          const ref = pending.current;
          if (handle.current !== h || !ref) return;
          pending.current = null;
          apply(h, ref);
        }, 0);
      },
      jump,
      jumpTo,
      showPanel,
      jumpToToken: (token) => {
        const ref = parseCitations(token)[0]?.ref;
        if (ref) jump(ref);
      },
      setPosition,
    }),
    [jump, jumpTo, showPanel],
  );

  return (
    <ActionsContext value={actions}>
      <PositionContext value={position}>{children}</PositionContext>
    </ActionsContext>
  );
}

function apply(h: ViewerHandle, target: CitationRef | JumpTarget) {
  if ("kind" in target) {
    if (target.kind === "annotation") {
      // The transcript and text rows flash too, whichever viewer is the source.
      requestAnnotationFlash(target.id);
      if (h.showAnnotation?.(target.id)) return;
      if (target.near) apply(h, target.near);
    } else if (target.kind === "quote") {
      if (h.showQuote?.(target.quote, target.near)) return;
      if (target.near) apply(h, target.near);
    } else if (target.kind === "cite") apply(h, target.ref);
    return;
  }
  const ref = target;
  if (ref.type === "time") h.seek?.(ref.sec);
  else if (ref.type === "page") h.showPage?.(ref.page);
  else h.showParagraph?.(ref.index);
}

/**
 * Scrolls `el` (plus `offset` pixels into it) to the top of its nearest scrolling box only. `scrollIntoView` would also
 * scroll every clipped ancestor, which shifts the dock panels around it.
 */
export function revealInScroller(el: HTMLElement, offset = 0) {
  let box = el.parentElement;
  while (box) {
    const { overflowY } = getComputedStyle(box);
    if ((overflowY === "auto" || overflowY === "scroll") && box.scrollHeight > box.clientHeight) {
      break;
    }
    box = box.parentElement;
  }
  if (!box) return;
  const top =
    el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop + offset;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  box.scrollTo({ top: Math.max(0, top - 16), behavior: reduce ? "auto" : "smooth" });
}

export function useViewer(): ViewerActions {
  const api = useContext(ActionsContext);
  if (!api) throw new Error("useViewer must be used inside <ViewerProvider>.");
  return api;
}

export function useViewerPosition(): ViewerPosition {
  return useContext(PositionContext);
}

/** Briefly tints an element so the reader sees where a jump landed. */
export function flash(el: Element, style: "tint" | "ring" = "tint") {
  const classes = style === "tint" ? ["bg-accent-tint"] : ["ring-2", "ring-accent"];
  el.classList.add(...classes);
  window.setTimeout(() => el.classList.remove(...classes), 1200);
}

/** The viewer when there is one (the content page), or null (a space's notes). */
export function useOptionalViewer(): ViewerActions | null {
  return useContext(ActionsContext);
}
