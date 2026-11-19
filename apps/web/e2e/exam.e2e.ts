import { expect, test } from "@playwright/test";
import { addPastedText, goto, unique } from "./support";

test("creates a space, adds a content, sits an exam and sees the topic breakdown", async ({
  page,
}) => {
  const contentTitle = unique("Exam source");
  await addPastedText(page, contentTitle);

  // A new space.
  const spaceName = unique("Physics");
  await goto(page, "/");
  await page.getByRole("textbox", { name: "New space" }).fill(spaceName);
  await page.getByRole("button", { name: "Create space" }).click();
  await page
    .getByRole("link", { name: new RegExp(spaceName) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: spaceName })).toBeVisible();

  // Add the content to it.
  await page.getByLabel("Add content to this space").selectOption({ label: contentTitle });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("link", { name: contentTitle })).toBeVisible();

  // A small exam: the scripted questions are multiple choice, true or false and free response.
  await page.getByRole("button", { name: "New exam" }).click();
  const dialog = page.getByRole("dialog", { name: "New exam" });
  await dialog.getByRole("spinbutton", { name: "Questions" }).fill("3");
  await dialog.getByRole("button", { name: "Create exam" }).click();
  await page.getByRole("link", { name: "Start" }).first().click();

  await page.getByRole("button", { name: "Start exam" }).click();
  await expect(page.getByRole("timer")).toContainText("left");
  await expect(page.getByText("0 of 3 answered")).toBeVisible();

  await page.getByRole("radio", { name: "The claim the source supports" }).first().check();
  await page.getByRole("radio", { name: "True", exact: true }).check();
  await page
    .getByRole("textbox", { name: "Your answer" })
    .fill("Entropy never decreases in an isolated system, so heat flows from hot to cold.");
  await expect(page.getByText("3 of 3 answered")).toBeVisible();

  await page.getByRole("button", { name: "Submit exam" }).click();
  // Two answers are right and the free response is graded 0.9 by the scripted model.
  await expect(page.getByRole("heading", { level: 1, name: "97%" })).toBeVisible();
  const byTopic = page.getByRole("heading", { name: "By topic" });
  await expect(byTopic).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "97% · 3 questions" })).toContainText(
    contentTitle,
  );
  await expect(page.getByRole("heading", { name: "Answers" })).toBeVisible();
});
