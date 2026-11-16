import { cx } from "@thoth/ui";

const empty =
  "[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0 [&_.is-empty]:before:text-ink-subtle [&_.is-empty]:before:content-[attr(data-placeholder)]";

/**
 * Hearth styles for the editable notes, as Tailwind variants on the editor root, so the same
 * look applies to typed text and to Claude's drafts. Matches the Summary renderer's styles.
 */
export const PROSE = cx(
  "min-h-60 pb-16 text-ink type-body caret-ink outline-none",
  "[&>:first-child]:mt-0",
  "[&_p]:my-2",
  "[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:type-heading-1",
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:type-heading-2",
  "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:type-heading-3",
  "[&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:type-label [&_h5]:type-label [&_h6]:type-label",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-1 [&_li]:pl-1 [&_li]:marker:text-ink-subtle [&_li>p]:my-0",
  "[&_strong]:font-semibold [&_em]:italic [&_s]:line-through",
  "[&_a]:text-accent-text [&_a]:underline",
  "[&_blockquote]:my-3 [&_blockquote]:rounded-md [&_blockquote]:bg-surface-300 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:text-ink-muted",
  // Callouts: a quote that starts with **Note:** (see callout.ts).
  "[&_blockquote.notes-callout]:rounded-lg [&_blockquote.notes-callout]:bg-info-tint [&_blockquote.notes-callout]:text-info",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-300 [&_pre]:p-4 [&_pre]:type-code",
  "[&_:not(pre)>code]:rounded-sm [&_:not(pre)>code]:bg-surface-300 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:type-code",
  "[&_hr]:my-6 [&_hr]:border-border-subtle",
  "[&_.ProseMirror-selectednode]:outline-2 [&_.ProseMirror-selectednode]:outline-offset-2 [&_.ProseMirror-selectednode]:outline-focus-ring",
  empty,
);
