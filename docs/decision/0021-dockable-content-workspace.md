# ADR-0021: Dockable content workspace with dockview

- Status: Accepted
- Date: 2026-11-15
- Supersedes: the fixed three-column content page from Phase 3 (`docs/technical_design/07-content-page-and-chat.md`)

## Context

The owner wants to arrange the content page freely, as in Claude Code or VS Code: for example the video, the notes and a quiz visible at once, with notes stacked above the quiz. The Phase 3 page had a fixed viewer column and a tabbed Learn panel.

## Decision

1. **The content page is a dock layout** built with `dockview` 8.8.3 (MIT, React, no dependencies). Every view is a **panel** that can be dragged, split (left, right, up, down), stacked as tabs, resized, maximised and closed.
2. **Panels come from one registry** (`apps/web/src/features/workspace/panels.ts`). Each entry has an `id`, a title, an icon and a client component that receives `WorkspacePanelProps` (`contentId`, `content`, `onCite`).
   - Panels: Source (video, PDF or text), Chapters, Transcript, Chat, Summary, Notes, Quiz, Flashcards.
   - The Learn tools from ADR-0016 and ADR-0017 become panels through the same `LearnTool.Panel` component.
3. **Citations work across panels.** `onCite` from any panel jumps the Source panel. If the Source panel is closed, it is reopened.
4. **The layout is saved per viewer** in `localStorage`, one layout shared by all contents.
   - Presets: **Study** (source and chat with Learn tools), **Watch + notes**, **Quiz** (source, notes above quiz). There is also **Reset layout**.
   - A saved layout that fails to load falls back to the default.
5. **On phones** (narrow screens) the dock turns into one panel at a time with a bottom tab bar, because drag and split make no sense on a small touch screen.

## Consequences

- Panels must render well at any size: no fixed widths, and each panel scrolls on its own.
- `dockview` is a client-only dependency in `apps/web`. Panels mount lazily when first shown.
