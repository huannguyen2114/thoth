import { expect, test } from "@playwright/test";
import { addPastedText, goto, unique } from "./support";

// Whiteboard and mind maps (ADR-0031, doc 18). The scripted LLM returns a map whose nodes cite
// real paragraphs of the pasted source.
test("makes a mind map linked to the source, adds a sticky and keeps both after a reload", async ({
  page,
}) => {
  const path = await addPastedText(page, unique("Whiteboard source"));
  await goto(page, path);
  const panels = page.getByRole("region", { name: "Workspace panels" });

  // Close the source first, so the citation has to reopen it.
  await panels.getByRole("button", { name: "Close Source" }).click();
  await expect(panels.getByRole("region", { name: "Source" })).toHaveCount(0);

  const tab = page.getByRole("tab", { name: "Whiteboard", exact: true });
  await tab.click();
  // Give the board room, as a person would: maximise its group. The citation below must
  // leave the maximised view to show the source.
  await tab
    .locator("xpath=ancestor::*[.//button[@aria-label='Maximise panel']][1]")
    .getByRole("button", { name: "Maximise panel" })
    .click();
  const board = page.getByRole("tabpanel", { name: "Whiteboard" });
  await board.getByRole("button", { name: "Make a mind map" }).click();
  await page
    .getByRole("dialog", { name: "Make a mind map" })
    .getByRole("button", { name: "Make mind map" })
    .click();

  const canvas = board.getByRole("application", { name: "Whiteboard canvas" });
  await expect(canvas.getByText("Source overview")).toBeVisible();
  const badges = canvas.getByRole("button", { name: /^Show .+ in the source$/ });
  await expect(badges.first()).toBeVisible();
  const elements = canvas.locator("[data-el-id]");
  const before = await elements.count();

  await board.getByRole("button", { name: "Add sticky" }).click();
  await expect(elements).toHaveCount(before + 1);
  await expect(board.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  // The source link must reopen the source.
  await badges.first().click();
  await expect(panels.getByRole("region", { name: "Source" })).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Whiteboard", exact: true }).click();
  const again = page.getByRole("tabpanel", { name: "Whiteboard" }).getByRole("application", {
    name: "Whiteboard canvas",
  });
  await expect(again.getByText("Source overview")).toBeVisible();
  await expect(again.locator("[data-el-id]")).toHaveCount(before + 1);

  await goto(page, "/history");
  await expect(page.getByText("Worked on a whiteboard").first()).toBeVisible();
});
