# ADR-0050: A second look, Modern, beside Hearth

- Status: Accepted
- Date: 2026-11-22
- Amends: ADR-0009, ADR-0047
- Builds on: ADR-0020, ADR-0021, ADR-0048

## Context

Hearth (ADR-0009, ADR-0047) is warm and bookish. The owner found that not everyone likes it, and asked for a second look like the chat apps people already use: ChatGPT, Codex, YouLearn, with a little of Apple's Liquid Glass. The layout should change too, not just the colours. The design was agreed on a mockup canvas first.

## Decision

1. **Two looks, chosen per device.** Settings › Appearance picks the look:
   - **Hearth**, the default;
   - **Modern**.

   The mode (System, Light, Dark) stays a separate choice, so there are four combinations. Modern also has an accent colour: graphite (the default), blue, green, violet or orange. The palette has "Use the Modern look" and "Use the Hearth look". The choice lives in `localStorage` (`thoth.skin`, `thoth.accent`). The first-paint script sets `data-skin` and `data-accent` on `<html>` before the page draws, so there is no flash.
2. **A theme is tokens, like Hearth.**
   - Modern's colours, shadows and type are in `design/skins/modern/tokens.json`. The token build writes them to `packages/ui/src/styles/skins.css`, as overrides of Hearth's tokens by name under `:root[data-skin="modern"]`, in light and dark, with an accent block for each accent colour.
   - The generated type styles, and the hero styles, now read variables first: `--ff-<family>`, `--fs-`, `--lh-`, `--fw-` and `--ls-<style>`. A theme can therefore change families and weights. Modern's headings are Geist semibold.
   - This amends ADR-0009: Hearth is no longer the only palette. A theme still uses tokens only, and the app still writes no hex.
   - A unit test (`packages/ui/src/contrast.test.ts`) checks WCAG AA contrast for every theme, mode and accent.
3. **What tokens can't do is CSS scoped to the look.**
   - `packages/ui/src/styles/modern.css` covers the expressive layer: no glows, sans hero type, and Apple-style glass.
   - `apps/web/src/app/modern.css` covers the app frame:
     - the sidebar floats as a frosted pane;
     - the page sits on a solid rounded sheet;
     - nav icons lose their tinted tiles;
     - recent sources are listed in the sidebar.
   - The `hearth-only` and `modern-only` classes swap parts of a page.
   - Glass is for chrome that floats (the sidebar, capsule tabs, the composer), never behind reading text. It turns opaque with `prefers-reduced-transparency`. This amends ADR-0047's glass rule only in degree.
4. **The layout changes in three places.**
   - **Sidebar:** recent sources, like a chat history. The shell loads them; Hearth hides them.
   - **Home:** the question and the composer come first, centred, then "Continue learning", the library and spaces. Hearth's at-a-glance strip, today card and heatmap are hidden in Modern.
   - **Content page:** a fixed split replaces the dock (ADR-0021) on desktop.
     - The source is on the left, with Chapters or Transcript under it.
     - The tools (Chat, Summary, Notes, Quiz, Flashcards, Whiteboard) are on the right, behind pill tabs.
     - The Study, Watch + notes and Quiz presets pick the tabs.
     - Panels stay mounted once opened, and the split's tabs are remembered (`thoth.workspace.split`).
     - Phones keep the one-panel layout in both looks.
     - Only this component reads the look in JavaScript (`useSkin`). Everything else is CSS.

## Consequences

- One codebase, two looks. A screen change must look right in both; the screenshots and the browser tests cover Hearth, plus Modern's home and content page.
- The Hearth dock's saved layout and the Modern split's tabs are separate, so switching looks loses neither.
- A third theme is a new `design/skins/<id>/tokens.json`, plus CSS only where tokens can't reach.
- The landing page keeps Hearth (it is the brand) and shows Modern as a feature.
