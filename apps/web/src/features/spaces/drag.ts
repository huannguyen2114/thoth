"use client";

import { type DragEvent, useState } from "react";

/** Drag a content onto a space (doc 22). The payload is the content id; text/plain is its title. */
export const CONTENT_MIME = "application/x-thoth-content";

export function startContentDrag(e: DragEvent, contentId: string, title: string) {
  e.dataTransfer.setData(CONTENT_MIME, contentId);
  e.dataTransfer.setData("text/plain", title);
  e.dataTransfer.effectAllowed = "move";
}

const carriesContent = (e: DragEvent) => e.dataTransfer.types.includes(CONTENT_MIME);

/** Props for a drop target that accepts a dragged content, plus whether one is over it. */
export function useContentDrop(onDropContent: (contentId: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    dropProps: {
      "data-over": over ? "true" : "false",
      onDragOver: (e: DragEvent) => {
        if (!carriesContent(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const id = e.dataTransfer.getData(CONTENT_MIME);
        if (!id) return;
        e.preventDefault();
        onDropContent(id);
      },
    },
  };
}
