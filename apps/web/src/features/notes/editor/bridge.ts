"use client";

import type { Editor } from "@tiptap/react";
import { flashRange } from "@/features/annotations/text-ranges";
import { revealInScroller } from "@/features/content-viewer/viewer-context";
import { quoteBlocks } from "./quote";
import { canonicalHref } from "./thoth-link";

/**
 * Lets other panels write into a notes document or scroll it, even while the Notes panel is
 * closed (doc 21). Requests for an owner queue until its editor has loaded, then run in order.
 * The editor saves the result through its normal autosave.
 */
export type NotesRequest =
  /** Append a blockquote with the passage and a link chip back to it. */
  | { kind: "quote"; text: string; href: string; label: string }
  /** Scroll to the first chip that links to `href` and flash it. */
  | { kind: "reveal"; href: string };

type Handler = (req: NotesRequest) => void;

const queues = new Map<string, NotesRequest[]>();
const handlers = new Map<string, Handler>();

/** Sends a request to the notes of `ownerKey` (`content:<id>` or `space:<id>`). */
export function sendToNotes(ownerKey: string, req: NotesRequest) {
  const h = handlers.get(ownerKey);
  if (h) h(req);
  else queues.set(ownerKey, [...(queues.get(ownerKey) ?? []), req]);
}

/** Called by a loaded editor. Runs what was queued, then every new request. */
export function attachNotes(ownerKey: string, handler: Handler): () => void {
  handlers.set(ownerKey, handler);
  const queued = queues.get(ownerKey) ?? [];
  queues.delete(ownerKey);
  // Next tick: the editor has just been filled and the panel may still be laying out.
  if (queued.length) window.setTimeout(() => queued.forEach(handler), 0);
  return () => {
    if (handlers.get(ownerKey) === handler) handlers.delete(ownerKey);
  };
}

const FLASH = ["ring-2", "ring-accent"];

/**
 * Shows where a quote is. ProseMirror owns the note's DOM and undoes class changes on it, so the
 * passage is painted with the CSS highlight API, and only the chip (a node view that ignores
 * DOM changes) gets a ring.
 */
function flashQuote(block: Element) {
  const range = document.createRange();
  range.selectNodeContents(block);
  flashRange(range, () => {});
  const chip = block.matches("[data-thoth-link]")
    ? block
    : block.querySelector("[data-thoth-link]");
  if (!chip) return;
  chip.classList.add(...FLASH);
  window.setTimeout(() => chip.classList.remove(...FLASH), 1600);
}

/** Scrolls `el` to the top of the Notes panel's own scroll box, never the dock around it. */
const reveal = (el: Element) => revealInScroller(el as HTMLElement);

/** Applies one request to a loaded editor. */
export function applyNotesRequest(editor: Editor, req: NotesRequest) {
  if (editor.isDestroyed) return;
  if (req.kind === "quote") {
    const doc = editor.state.doc;
    const lastNode = doc.lastChild;
    // Replace a trailing empty paragraph instead of leaving a gap above the quote.
    const endsEmpty = lastNode?.type.name === "paragraph" && lastNode.content.size === 0;
    const from = endsEmpty ? doc.content.size - lastNode.nodeSize : doc.content.size;
    editor
      .chain()
      .insertContentAt({ from, to: doc.content.size }, quoteBlocks(req.text, req.href, req.label))
      .run();
    // The new quote is the second-to-last block.
    const dom = editor.view.dom;
    const quote = dom.children[dom.children.length - 2];
    if (quote) {
      reveal(quote);
      flashQuote(quote);
    }
    return;
  }
  const want = canonicalHref(req.href);
  const chip = [...editor.view.dom.querySelectorAll<HTMLElement>("[data-thoth-link]")].find(
    (el) => el.dataset.href === want,
  );
  if (!chip) return;
  const block = chip.closest("blockquote") ?? chip;
  reveal(block);
  flashQuote(block);
}
