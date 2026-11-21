"use client";

import { parseCitations, parseLocatorParam } from "@thoth/core";
import { useEffect } from "react";
import { refOfLocator } from "@/features/annotations/open-link";
import { notesOwner } from "@/features/annotations/use-passage";
import { sendToNotes } from "@/features/notes/editor/bridge";
import { type JumpTarget, useViewer } from "./viewer-context";

/** The jump a content page URL asks for (doc 21). Pure, so it is unit tested. */
export function jumpFromUrl(at: string | undefined, params: URLSearchParams): JumpTarget | null {
  const ann = params.get("ann");
  const set = params.get("set");
  const q = params.get("q");
  const token = at ?? params.get("at") ?? undefined;
  // `[p.3]` (exam results, Cmd+K) or `p.3` / `t.201` (a thoth: link).
  const cite = token ? parseCitations(token)[0]?.ref : undefined;
  const near = cite ?? (token ? refOfLocator(parseLocatorParam(token)) : null);
  if (ann) return { kind: "annotation", id: ann, near };
  if (set) return { kind: "set", setId: set, quote: q ?? undefined };
  if (q) return { kind: "quote", quote: q, near };
  return near ? { kind: "cite", ref: near } : null;
}

/**
 * Jumps the viewer to where the URL points: a citation token (`?at=[p.3]`, used by exam results
 * and the progress page), a link position (`?at=p.3`), an annotation (`?ann=`), a passage
 * (`?q=`), a summary passage (`?set=&q=`), or a quote in this content's notes (`?reveal=`).
 * Retries briefly because viewers (the YouTube player especially) register a moment after mount.
 */
export function InitialJump({ token }: { token: string | undefined }) {
  const { jumpTo, showPanel } = useViewer();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reveal = params.get("reveal");
    if (reveal) {
      const contentId = window.location.pathname.split("/").filter(Boolean)[1];
      if (contentId) sendToNotes(notesOwner(contentId), { kind: "reveal", href: reveal });
      const t = window.setTimeout(() => showPanel("notes"), 300);
      return () => window.clearTimeout(t);
    }
    const target = jumpFromUrl(token, params);
    if (!target) return;
    // A citation retries until the viewer is there (the YouTube player is slow to register).
    // Annotation, passage and summary jumps wait inside their viewer instead, so they run once.
    const times = target.kind === "cite" ? [300, 1200, 2500] : [500];
    const timers = times.map((ms) => setTimeout(() => jumpTo(target), ms));
    return () => timers.forEach(clearTimeout);
  }, [token, jumpTo, showPanel]);
  return null;
}
