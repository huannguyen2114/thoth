import { Placeholder } from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import type { Extensions } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Callout } from "./callout";
import { Citation, type CitationOptions } from "./citation";
import { SlashCommand, type SlashOptions } from "./slash";

export interface NotesExtensionOptions {
  onCite?: CitationOptions["onCite"];
  slash?: SlashOptions;
}

/**
 * The one list of editor extensions (ADR-0022). Everything offered here must round-trip
 * through Markdown: `markdown.test.ts` proves it, block by block.
 *
 * Not offered, because Markdown cannot hold it: underline, colours, alignment.
 */
export function notesExtensions(options: NotesExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      underline: false,
      link: {
        openOnClick: true,
        autolink: true,
        HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" },
      },
    }),
    Markdown.configure({ markedOptions: { gfm: true } }),
    Citation.configure({ onCite: options.onCite ?? (() => {}) }),
    Callout,
    Placeholder.configure({
      placeholder: ({ editor }) =>
        editor.isEmpty
          ? "Write your notes. Type / for headings, lists and more, or [p.3] to cite the source."
          : "Type / for blocks",
    }),
    ...(options.slash ? [SlashCommand.configure(options.slash)] : []),
  ];
}
