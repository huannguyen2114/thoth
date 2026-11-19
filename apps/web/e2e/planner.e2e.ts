import { expect, test } from "@playwright/test";
import { addPastedText, goto, unique } from "./support";

// Study planner (ADR-0030, doc 17).
test("plans a goal, shows today's tasks and ticks one off", async ({ page }) => {
  const source = unique("Planner source");
  await addPastedText(page, source);
  const planName = unique("Thermo plan");

  await goto(page, "/planner");
  await page.getByRole("button", { name: "New plan" }).click();
  const dialog = page.getByRole("dialog", { name: "New study plan" });
  await dialog.getByLabel("What to study").selectOption({ label: "Choose contents…" });
  await dialog.getByRole("checkbox", { name: source }).check();
  await dialog.getByLabel("Name").fill(planName);
  // Every day is a study day, so today always has work whatever day the suite runs.
  const sunday = dialog.getByRole("button", { name: "Sun" });
  if ((await sunday.getAttribute("aria-pressed")) !== "true") await sunday.click();
  await dialog.getByRole("button", { name: "Create plan" }).click();
  await expect(dialog).toBeHidden();

  const tasks = page.getByRole("region", { name: "Tasks for the day" });
  await expect(tasks.getByRole("heading", { name: "Today" })).toBeVisible();
  const first = tasks.getByRole("checkbox", { name: /, not done$/ }).first();
  const name = (await first.getAttribute("aria-label"))?.replace(/, not done$/, "") ?? "";
  expect(name).not.toBe("");
  await first.check();
  const done = tasks.getByRole("checkbox", { name: `${name}, done` });
  await expect(done).toBeChecked();

  await page.reload();
  await expect(
    page.getByRole("region", { name: "Tasks for the day" }).getByRole("checkbox", {
      name: `${name}, done`,
    }),
  ).toBeChecked();

  // Home's Today card lists the plan's tasks.
  await goto(page, "/");
  const today = page.getByRole("region", { name: "Today" });
  await expect(today.getByText(planName).first()).toBeVisible();

  await goto(page, "/history");
  await expect(page.getByText("Finished a planned task").first()).toBeVisible();
});
