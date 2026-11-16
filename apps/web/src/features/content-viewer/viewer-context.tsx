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

/**
 * What a source viewer can do. Each viewer registers one handle; citation chips, chapters
 * and the transcript call `jump`, which routes to the handle. Unsupported jumps (a page
 * citation on a video) are ignored.
 */
export interface ViewerHandle {
  seek?(sec: number): void;
  showPage?(page: number): void;
  showParagraph?(index: number): void;
}

/** Where the reader is now: the playback time, or the page or paragraph in view. */
export type ViewerPosition = CitationRef | null;

interface ViewerActions {
  register(handle: ViewerHandle | null): void;
  jump(ref: CitationRef): void;
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
  const pending = useRef<CitationRef | null>(null);
  const onJumpRef = useRef(onJump);
  useEffect(() => {
    onJumpRef.current = onJump;
  }, [onJump]);
  const [position, setPosition] = useState<ViewerPosition>(null);

  const jump = useCallback((ref: CitationRef) => {
    onJumpRef.current?.();
    const h = handle.current;
    if (h) apply(h, ref);
    else pending.current = ref;
  }, []);

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
      jumpToToken: (token) => {
        const ref = parseCitations(token)[0]?.ref;
        if (ref) jump(ref);
      },
      setPosition,
    }),
    [jump],
  );

  return (
    <ActionsContext value={actions}>
      <PositionContext value={position}>{children}</PositionContext>
    </ActionsContext>
  );
}

function apply(h: ViewerHandle, ref: CitationRef) {
  if (ref.type === "time") h.seek?.(ref.sec);
  else if (ref.type === "page") h.showPage?.(ref.page);
  else h.showParagraph?.(ref.index);
}

/**
 * Scrolls `el` to the top of its nearest scrolling box only. `scrollIntoView` would also
 * scroll every clipped ancestor, which shifts the dock panels around it.
 */
export function revealInScroller(el: HTMLElement) {
  let box = el.parentElement;
  while (box) {
    const { overflowY } = getComputedStyle(box);
    if ((overflowY === "auto" || overflowY === "scroll") && box.scrollHeight > box.clientHeight) {
      break;
    }
    box = box.parentElement;
  }
  if (!box) return;
  const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
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
