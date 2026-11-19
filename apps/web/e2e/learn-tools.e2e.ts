import { expect, test } from "@playwright/test";
import { addPastedText, goto, unique } from "./support";

// One pasted source per test, so the tools never depend on each other or on earlier runs.
test.describe("learn tools", () => {
  test("generates a summary with citations", async ({ page }) => {
    const path = await addPastedText(page, unique("Summary source"));
    await goto(page, path);

    await page.getByRole("button", { name: "Generate summary" }).click();
    await page
      .getByRole("dialog", { name: "Generate summary" })
      .getByRole("button", { name: "Generate summary" })
      .click();

    const summary = page.getByRole("tabpanel", { name: "Summary" });
    await expect(summary.getByRole("heading", { name: "Scripted summary" })).toBeVisible();
    await expect(summary.getByRole("list", { name: "My summaries" })).toContainText("Ready");
    await expect(
      summary.getByRole("button", { name: /^Go to .* in the source$/ }).first(),
    ).toBeVisible();
  });

  test("generates a quiz, answers it and shows feedback", async ({ page }) => {
    const path = await addPastedText(page, unique("Quiz source"));
    await goto(page, path);
    await page.getByRole("tab", { name: "Quiz", exact: true }).click();
    const quiz = page.getByRole("tabpanel", { name: "Quiz" });

    await quiz.getByRole("button", { name: "Generate quiz" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Generate a quiz" });
    await dialog.getByRole("checkbox", { name: "Free response" }).check();
    await dialog.getByRole("spinbutton", { name: "Questions per topic" }).fill("4");
    await dialog.getByRole("button", { name: "Generate quiz" }).click();

    await quiz.getByRole("button", { name: "Start" }).first().click();
    await expect(quiz.getByText("Question 1 of 4")).toBeVisible();

    // Question 1 is multiple choice: the scripted correct choice is "The claim the source supports".
    await quiz.getByRole("radio", { name: "The claim the source supports" }).check();
    await quiz.getByRole("button", { name: "Check answer" }).click();
    await expect(quiz.getByRole("status")).toContainText("Correct");
    await quiz.getByRole("button", { name: "Next question" }).click();

    // Question 2 is true or false; answer wrongly to see the other feedback.
    await expect(quiz.getByText("Question 2 of 4")).toBeVisible();
    await quiz.getByRole("radio", { name: "False" }).check();
    await quiz.getByRole("button", { name: "Check answer" }).click();
    await expect(quiz.getByRole("status")).toContainText("Not quite");
    await quiz.getByRole("button", { name: "Next question" }).click();

    // Question 3 is free response, graded by the (scripted) model.
    await expect(quiz.getByText("Question 3 of 4")).toBeVisible();
    await quiz
      .getByRole("textbox")
      .fill("Entropy never decreases in an isolated system, so heat flows from hot to cold.");
    await quiz.getByRole("button", { name: "Check answer" }).click();
    await expect(quiz.getByRole("status")).toContainText("You covered the main point");
  });

  test("generates flashcards and reviews one", async ({ page }) => {
    const path = await addPastedText(page, unique("Cards source"));
    await goto(page, path);
    await page.getByRole("tab", { name: "Flashcards", exact: true }).click();
    const cards = page.getByRole("tabpanel", { name: "Flashcards" });

    await cards.getByRole("button", { name: "Generate flashcards" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Generate flashcards" });
    await dialog.getByRole("spinbutton", { name: "Number of cards" }).fill("3");
    await dialog.getByRole("button", { name: "Generate flashcards" }).click();

    await expect(cards.getByText("3 cards · 3 due")).toBeVisible();
    await cards.getByRole("button", { name: "Open" }).click();
    await cards.getByRole("button", { name: "Review 3 due" }).click();

    await expect(cards.getByText(/3 left · 0 reviewed/)).toBeVisible();
    await cards.getByRole("button", { name: "Show answer" }).click();
    await cards.getByRole("button", { name: /^Good/ }).click();
    await expect(cards.getByText(/1 reviewed/)).toBeVisible();
  });
});
