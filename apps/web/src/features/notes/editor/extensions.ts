import { Placeholder } from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import type { Extensions } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Callout } from "./callout";
import { Citation, type CitationOptions } from "./citation";
import { LinkTrigger, type LinkTriggerOptions } from "./link-trigger";
import { SlashCommand, type SlashOptions } from "./slash";
import { ThothLink, type ThothLinkOptions } from "./thoth-link";

export interface NotesExtensionOptions {
  onCite?: CitationOptions["onCite"];
  slash?: SlashOptions;
  /** Opens a `thoth:` link chip (doc 21). */
  onOpenLink?: ThothLinkOptions["onOpen"];
  /** The `[[` / `@` link picker. */
  links?: LinkTriggerOptions;
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
    ThothLink.configure({ onOpen: options.onOpenLink ?? (() => undefined) }),
    Callout,
    Placeholder.configure({
      placeholder: ({ editor }) =>
        editor.isEmpty
          ? "Write your notes. Type / for headings, lists and more, [p.3] to cite the source, or [[ to link."
          : "Type / for blocks",
    }),
    ...(options.slash ? [SlashCommand.configure(options.slash)] : []),
    ...(options.links ? [LinkTrigger.configure(options.links)] : []),
  ];
}
