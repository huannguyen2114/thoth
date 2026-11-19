import { expect, test } from "@playwright/test";
import { addPastedText, goto, unique } from "./support";

test("progress shows the study heatmap with today's activity", async ({ page }) => {
  await addPastedText(page, unique("Progress source")); // any study action counts for today
  await goto(page, "/progress");

  await expect(page.getByRole("heading", { level: 1, name: "Progress" })).toBeVisible();
  const habits = page.getByRole("region", { name: "Study habits" });
  await expect(
    habits.getByRole("img", { name: "Study activity over the last year" }),
  ).toBeVisible();
  // The heatmap has one button per day; today's has a count.
  await expect(
    habits.getByRole("button", { name: /^[1-9]\d* actions? on / }).first(),
  ).toBeVisible();
  await expect(habits.getByText(/Current streak/)).toBeVisible();
});
