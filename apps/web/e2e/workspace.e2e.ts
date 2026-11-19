import { expect, test } from "@playwright/test";
import { goto, runCommand, unique } from "./support";

test.describe("content workspace on the sample lecture", () => {
  test("applies a layout from Cmd+K and keeps notes after a reload", async ({ page }) => {
    await goto(page, "/content/sample-lecture");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sample: Introduction to the Human Brain" }),
    ).toBeVisible();

    await runCommand(page, "Workspace: Quiz layout");
    const panels = page.getByRole("region", { name: "Workspace panels" });
    await expect(panels.getByRole("tabpanel", { name: "Notes" })).toBeVisible();
    await expect(panels.getByRole("tabpanel", { name: "Quiz" })).toBeVisible();
    await expect(panels.getByRole("tabpanel", { name: "Chat" })).toHaveCount(0);

    // Real key events: a pasted value would skip the editor's own input handling.
    const note = unique("My e2e note");
    const notes = panels.getByRole("tabpanel", { name: "Notes" });
    await notes.getByRole("textbox", { name: "Notes" }).click();
    await page.keyboard.type(note);
    await expect(notes.getByRole("status")).toHaveText("Saved");

    await page.reload();
    await expect(page.getByRole("tabpanel", { name: "Notes" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Notes" })).toContainText(note);
  });

  test("chat streams an answer with a citation, and the chip reopens the source", async ({
    page,
  }) => {
    await goto(page, "/content/sample-lecture");
    const panels = page.getByRole("region", { name: "Workspace panels" });

    // Close the source first: a citation jump must reveal it again.
    await panels.getByRole("button", { name: "Close Video" }).click();
    await expect(panels.getByRole("region", { name: "Video" })).toHaveCount(0);

    const question = "What is the course about?";
    await page.getByRole("textbox", { name: "Ask a question about this source" }).fill(question);
    await page.getByRole("button", { name: "Send question" }).click();

    const chat = panels.getByRole("region", { name: "Chat" });
    await expect(chat.getByText(/Based on the source, Welcome\./)).toBeVisible();
    const chip = chat.getByRole("button", { name: "Play from 00:00" });
    await expect(chip).toBeVisible();

    await chip.click();
    await expect(panels.getByRole("region", { name: "Video" })).toBeVisible();
  });
});
