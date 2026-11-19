import { test } from "@playwright/test";

// Phase 9 Lane 4 (whiteboard and mind maps, ADR-0031) builds the whiteboard in parallel. The
// orchestrator enables this journey when the lane is merged: change `test.fixme` to `test` and
// fill in the real labels.
test.fixme("draws on the whiteboard, generates a mind map and keeps it after a reload", async ({
  page,
}) => {
  // 1. Open /content/sample-lecture and the Whiteboard tab of the Learn panel.
  // 2. Add a shape or a sticky note with real pointer events; it appears on the canvas.
  // 3. "Generate mind map": the scripted LLM returns a map whose nodes cite real segments;
  //    click a node's citation and the Source panel reports the jump.
  // 4. Reload: the elements are still there (autosave), and the history entry
  //    "whiteboard_edit" shows in /history.
  await page.goto("/content/sample-lecture");
});
