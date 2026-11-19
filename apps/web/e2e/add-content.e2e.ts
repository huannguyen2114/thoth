import { expect, test } from "@playwright/test";
import { goto, unique } from "./support";

test("pasted text is added, processed and opens as a ready source", async ({ page }) => {
  const title = unique("Photosynthesis");
  await goto(page, "/");

  await page.getByRole("tab", { name: "Paste" }).click();
  const box = page.getByRole("textbox", { name: "Text to learn from" });
  await expect(page.getByRole("button", { name: "Add text" })).toBeDisabled();
  await box.fill(
    `${title}\n\nPlants turn light into sugar. Chlorophyll absorbs red and blue light.\n\nThe sugar feeds the plant and, through the food chain, nearly everything else.`,
  );
  await page.getByRole("button", { name: "Add text" }).click();

  // The row appears in Recents at once and settles on Ready when the ingest job is done.
  // (The "processing" state lasts a few milliseconds with the scripted LLM, so it is not asserted.)
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Text");
  await expect(row).toContainText("Ready");
  await expect(box).toHaveValue("");

  await row.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  // The source panel shows what was pasted, as numbered paragraphs.
  await expect(page.getByText("Chlorophyll absorbs red and blue light.")).toBeVisible();
});
