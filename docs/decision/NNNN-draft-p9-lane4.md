# ADR-NNNN (draft, Phase 9 Lane 4): Whiteboard operations, guards and background runs

- Status: Proposed (the orchestrator numbers and accepts it at merge)
- Date: 2026-11-19
- Builds on: ADR-0016, ADR-0021, ADR-0031

## Context

ADR-0031 fixes the element model, Claude's writes through validated operations, a tidy-tree mind map, and a custom canvas. Building it needed several choices that are hard to undo once boards exist and Claude's prompts depend on them.

## Decision

1. **The canvas saves operations, not the whole board.** Autosave diffs the board on screen against the last version the server confirmed (`diffElements`) and sends `applyOps`. Core applies them on top of the newest version with compare-and-swap and retries once on a stale version. A person's save therefore never undoes a change Claude saved meanwhile. `applyOps` is all or nothing; Claude's operations are applied leniently (refused ones are skipped and reported).
2. **Claude writes a flat operation schema, not `boardOpSchema` directly.** `claudeOpsSchema` has no unions, regexes or number limits, so both LLM adapters (structured output through the CLI and the API) accept it. Core converts it to `boardOpSchema` operations and validates those. New ids get a per-run prefix, every new element is `by: "claude"`, and a citation token becomes a `source` only when it points at a real place in the content.
3. **"Unless the request says so" means selection.** Operations on a `by: "person"` element are applied only when the person selected it before asking (`mayChange`). This is deterministic, testable and visible in the UI ("Ask Claude about the 2 selected elements…"). Rewording one of Claude's elements makes it the person's.
4. **Placement guard, nothing more.** If any new element Claude adds would overlap an existing one, the new group moves as one to the right of the board. Core does no other layout fix-ups; the layout rules in the prompt do the rest. Mind maps are laid out entirely by core (tidy tree, ADR-0031).
5. **Runs in the background, polled.** "Ask Claude…" and "Mind map" start a run in a process-wide registry, return its id at once, continue in `after()`, and are polled every 800 ms (ADR-0016's pattern). The run saves into the board, so closing the panel loses nothing. Mind maps go on a new board.
6. **Task `chat`, no new LLM task.** Both use the `chat` task (and its model setting). A separate `whiteboard` task can be added later if the owner wants a different model for it.
7. **`whiteboard_edit` activity is throttled** to once per board per hour, like `note_edit`.
8. **Board colours come from Hearth tokens.** The seven board colours map to the status and accent tints (`warning-tint` for yellow, `accent-tint` for peach, `danger-tint` for pink, `success-tint` for green, `info-tint` for blue, `surface-200` for white). Purple has no token, so it is `color-mix(in oklab, info-tint 50%, danger-tint)`. Edges and ink colours mix the matching status colour the same way. No hex values. Board geometry (positions, handle sizes) is in board units inside `whiteboard.css` and inline styles, since it is data, not chrome.
9. **Keyboard.** App-level shortcuts (undo, redo, copy, paste, duplicate, select all, zoom) are `Command`s registered only while the canvas has focus and no text is being edited, so the global handler never takes keys from chat or notes. Single-letter tool keys are handled by the focused canvas element, not by a window listener.

## Consequences

- Concurrent edits from Claude and the person merge by element id; the last writer wins per element.
- Claude cannot change a person's element without a selection, even when the request names it in words.
- The flat model schema must be kept in step with the element model when either changes.
