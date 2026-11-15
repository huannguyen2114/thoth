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
  /** Called on every jump, e.g. to switch the mobile layout to the source view. */
  onJump?: () => void;
}) {
  const handle = useRef<ViewerHandle | null>(null);
  const onJumpRef = useRef(onJump);
  useEffect(() => {
    onJumpRef.current = onJump;
  }, [onJump]);
  const [position, setPosition] = useState<ViewerPosition>(null);

  const jump = useCallback((ref: CitationRef) => {
    const h = handle.current;
    if (!h) return;
    onJumpRef.current?.();
    if (ref.type === "time") h.seek?.(ref.sec);
    else if (ref.type === "page") h.showPage?.(ref.page);
    else h.showParagraph?.(ref.index);
  }, []);

  const actions = useMemo<ViewerActions>(
    () => ({
      register: (h) => {
        handle.current = h;
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
