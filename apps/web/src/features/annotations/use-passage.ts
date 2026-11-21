"use client";

import type { BacklinkSource, Locator } from "@thoth/core";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useOptionalViewer } from "@/features/content-viewer/viewer-context";
import { sendToNotes } from "@/features/notes/editor/bridge";
import { AUTOSAVE_MS } from "@/features/notes/use-autosave";
import { makeFlashcardAction } from "./actions";
import { annotationStore } from "./store";

export const notesOwner = (contentId: string) => `content:${contentId}`;

/**
 * What every selection toolbar can do with a passage of one content (doc 21): send it to the
 * content's notes as a quote with a link chip, turn it into a flashcard, and open the notes
 * that quote it.
 */
export function usePassage(contentId: string) {
  const viewer = useOptionalViewer();
  const router = useRouter();

  const refreshSoon = useCallback(() => {
    // The notes save on their own debounce; the backlink index follows that save.
    const store = annotationStore(contentId);
    for (const ms of [AUTOSAVE_MS + 900, AUTOSAVE_MS + 3000]) {
      window.setTimeout(() => void store.refreshBacklinks(), ms);
    }
  }, [contentId]);

  const addToNotes = useCallback(
    (text: string, href: string, label: string) => {
      sendToNotes(notesOwner(contentId), { kind: "quote", text, href, label });
      viewer?.showPanel("notes");
      refreshSoon();
    },
    [contentId, viewer, refreshSoon],
  );

  const flashcard = useCallback(
    async (
      input: { annotationId: string } | { quote: string; locator: Locator | null },
      suggest: boolean,
    ): Promise<{ ok: boolean; message: string }> => {
      try {
        const r = await makeFlashcardAction(
          "annotationId" in input
            ? { annotationId: input.annotationId, suggest }
            : { contentId, quote: input.quote, locator: input.locator, suggest },
        );
        if (!r.ok) return { ok: false, message: r.error };
        const how =
          suggest && !r.value.suggested
            ? " Claude was not available, so it is a fill-in card."
            : "";
        return { ok: true, message: `Card added to ${r.value.setTitle}.${how}` };
      } catch {
        return { ok: false, message: "Could not reach the server. No card was made." };
      }
    },
    [contentId],
  );

  const openBacklink = useCallback(
    (s: BacklinkSource) => {
      if (s.owner.kind === "content" && s.owner.contentId === contentId) {
        sendToNotes(notesOwner(contentId), { kind: "reveal", href: s.href });
        viewer?.showPanel("notes");
      } else if (s.owner.kind === "content") {
        router.push(`/content/${s.owner.contentId}?reveal=${encodeURIComponent(s.href)}`);
      } else if (s.owner.kind === "space") {
        router.push(`/spaces/${s.owner.spaceId}`);
      }
    },
    [contentId, viewer, router],
  );

  return useMemo(
    () => ({ addToNotes, flashcard, openBacklink }),
    [addToNotes, flashcard, openBacklink],
  );
}
