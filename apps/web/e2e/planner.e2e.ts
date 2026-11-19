import { test } from "@playwright/test";

// Phase 9 Lane 3 (study planner, ADR-0030) builds the planner in parallel. The orchestrator
// enables this journey when the lane is merged: change `test.fixme` to `test` and fill in the
// real labels.
test.fixme("plans an exam, shows today's items and ticks one off", async ({ page }) => {
  // 1. Add a content and a space containing it (use addPastedText from ./support).
  // 2. Open the planner (sidebar item "Planner").
  // 3. Create a plan: pick the space, an exam date a week away, a daily time budget.
  // 4. The plan lists items per day; today's items also appear in the "Today" section on Home.
  // 5. Tick today's first item: it moves to done and the heatmap counts a `plan_item_done` action.
  // 6. Reload: the item is still done.
  await page.goto("/");
});
