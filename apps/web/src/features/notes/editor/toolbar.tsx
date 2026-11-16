"use client";

import { cx } from "@thoth/ui";
import { type Editor, useEditorState } from "@tiptap/react";
import type { ReactNode } from "react";

interface Tool {
  id: string;
  label: string;
  shortcut: string;
  glyph: ReactNode;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
}

const mod =
  typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform) ? "⌘" : "Ctrl+";

const GROUPS: Tool[][] = [
  [
    {
      id: "bold",
      label: "Bold",
      shortcut: `${mod}B`,
      glyph: <span className="font-semibold">B</span>,
      isActive: (e) => e.isActive("bold"),
      run: (e) => e.chain().focus().toggleBold().run(),
    },
    {
      id: "italic",
      label: "Italic",
      shortcut: `${mod}I`,
      glyph: <span className="font-serif italic">I</span>,
      isActive: (e) => e.isActive("italic"),
      run: (e) => e.chain().focus().toggleItalic().run(),
    },
    {
      id: "code",
      label: "Inline code",
      shortcut: `${mod}E`,
      glyph: <span className="font-mono">{"<>"}</span>,
      isActive: (e) => e.isActive("code"),
      run: (e) => e.chain().focus().toggleCode().run(),
    },
  ],
  [1, 2, 3].map((level) => ({
    id: `h${level}`,
    label: `Heading ${level}`,
    shortcut: `${"#".repeat(level)} space`,
    glyph: `H${level}`,
    isActive: (e: Editor) => e.isActive("heading", { level }),
    run: (e: Editor) =>
      e
        .chain()
        .focus()
        .toggleHeading({ level: level as 1 | 2 | 3 })
        .run(),
  })),
  [
    {
      id: "bullets",
      label: "Bulleted list",
      shortcut: "- space",
      glyph: "•",
      isActive: (e) => e.isActive("bulletList"),
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      id: "numbers",
      label: "Numbered list",
      shortcut: "1. space",
      glyph: "1.",
      isActive: (e) => e.isActive("orderedList"),
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      id: "quote",
      label: "Quote",
      shortcut: "> space",
      glyph: "“",
      isActive: (e) => e.isActive("blockquote"),
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      id: "codeBlock",
      label: "Code block",
      shortcut: "```",
      glyph: <span className="font-mono">{"{}"}</span>,
      isActive: (e) => e.isActive("codeBlock"),
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
  ],
];

const ALL = GROUPS.flat();

/**
 * Formatting buttons. They wrap on narrow panels and hide below 20rem, where the Markdown
 * shortcuts and the slash menu still do everything.
 */
export function Toolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      Object.fromEntries(ALL.map((t) => [t.id, e ? t.isActive(e) : false])) as Record<
        string,
        boolean
      >,
  });

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="hidden flex-wrap items-center gap-x-4 gap-y-1 @xs:flex"
    >
      {GROUPS.map((group) => (
        // Groups are spaced, not divided: a divider would dangle at the start of a wrapped row.
        <div key={group[0]?.id} className="flex items-center gap-1">
          {group.map((tool) => (
            <button
              key={tool.id}
              type="button"
              aria-label={tool.label}
              aria-pressed={active?.[tool.id] ?? false}
              title={`${tool.label} (${tool.shortcut})`}
              disabled={disabled}
              // Keep the selection in the editor while clicking.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => tool.run(editor)}
              className={cx(
                "grid h-8 min-w-8 cursor-default place-items-center rounded-md px-2 type-label text-ink-muted select-none",
                "transition-colors duration-150 hover:bg-surface-300 hover:text-ink active:bg-neutral-tint",
                "aria-pressed:bg-surface-300 aria-pressed:text-ink disabled:opacity-50",
                "pointer-coarse:h-11 pointer-coarse:min-w-11",
              )}
            >
              {tool.glyph}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
