import { expect, test } from "@playwright/test";
import { addFlashcards, addPastedText, goto, unique } from "./support";

test("the review page serves due cards and records a rating", async ({ page }) => {
  const path = await addPastedText(page, unique("Review source"));
  await addFlashcards(page, path, 2);

  await goto(page, "/review");
  await expect(page.getByRole("heading", { level: 1, name: "Due today" })).toBeVisible();
  const review = page.getByRole("region", { name: "Review" });
  await expect(review.getByText(/\d+ left · 0 reviewed/)).toBeVisible();

  await review.getByRole("button", { name: "Show answer" }).click();
  await review.getByRole("button", { name: /^Good/ }).click();
  await expect(review.getByText(/ · 1 reviewed/)).toBeVisible();
});
