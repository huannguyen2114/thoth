import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { addFlashcards, addPastedText, goto, runCommand } from "./support";

/**
 * Screenshots for the landing page (ADR-0044, doc 23). Each `shot(page, "<id>")` writes
 * apps/site/public/shots/<id>-light.png and <id>-dark.png; `pnpm site:check` compares these ids
 * with the ones apps/site/content/site.ts uses. When a screen changes, update its scene here.
 *
 * Runs with `pnpm site:shots` (playwright.shots.config.ts), never as part of the e2e suite.
 */
const OUT = join(import.meta.dirname, "../../site/public/shots");
const PDF = join(import.meta.dirname, "fixtures", "thermo-lecture.pdf");
const PASSAGE = "The second law says that the entropy of an isolated system never decreases.";

async function shot(page: Page, id: string) {
  await mkdir(OUT, { recursive: true });
  // The dev server's Next.js badge is not part of the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    await page.screenshot({
      path: join(OUT, `${id}-${scheme}.png`),
      animations: "disabled",
      caret: "hide",
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function uploadPdf(page: Page): Promise<string> {
  await goto(page, "/");
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.locator("#pdf-upload").setInputFiles(PDF);
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: /thermo/i }) })
    .first();
  await expect(row).toContainText("Ready", { timeout: 30_000 });
  const href = await row
    .getByRole("link", { name: /thermo/i })
    .first()
    .getAttribute("href");
  if (!href) throw new Error("The uploaded PDF has no link.");
  return href;
}

async function selectInPdf(page: Page, text: string) {
  await expect(page.locator(".pdf-text-layer[data-ready='true']").first()).toBeAttached({
    timeout: 20_000,
  });
  await page.evaluate((want) => {
    const span = [...document.querySelectorAll(".pdf-text-layer span")].find((s) =>
      s.textContent?.includes(want),
    );
    const node = span?.firstChild;
    if (!span || !node) throw new Error(`No text layer span with "${want}"`);
    const range = document.createRange();
    const at = (node.textContent ?? "").indexOf(want);
    range.setStart(node, at);
    range.setEnd(node, at + want.length);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    span.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  }, text);
  const bar = page.getByRole("toolbar", { name: "Selected text" });
  await expect(bar).toBeVisible();
  return bar;
}

test.describe
  .serial("landing page screenshots", () => {
    let pdf = "";

    test("workspace, chat, pdf and notes", async ({ page }) => {
      pdf = await uploadPdf(page);
      await goto(page, pdf);
      await expect(page.locator(".pdf-text-layer[data-ready='true']").first()).toBeAttached({
        timeout: 20_000,
      });
      await shot(page, "workspace");

      await page
        .getByRole("textbox", { name: "Ask a question about this source" })
        .fill("What does the second law say?");
      await page.getByRole("button", { name: "Send question" }).click();
      const chat = page.getByRole("region", { name: "Chat" });
      await expect(
        chat.getByRole("button", { name: /Go to page|Show page|p\.\d/ }).first(),
      ).toBeVisible();
      await shot(page, "chat");

      await runCommand(page, "Workspace: Quiz layout");
      const bar = await selectInPdf(page, PASSAGE);
      await bar.getByRole("button", { name: "Add to notes" }).click();
      const notes = page.getByRole("tabpanel", { name: "Notes" });
      await expect(notes.locator("blockquote")).toContainText("entropy");
      await expect(notes.getByRole("status")).toHaveText("Saved");
      await page.keyboard.press("Escape");
      await shot(page, "notes");

      // The PDF with its annotations list open beside the highlight.
      await page.getByRole("button", { name: /^Annotations/ }).click();
      await expect(page.getByText(PASSAGE).last()).toBeVisible();
      await shot(page, "pdf");
    });

    test("quiz and progress", async ({ page }) => {
      const path = await addPastedText(page, "Thermodynamics: entropy and heat");
      await goto(page, path);
      await page.getByRole("tab", { name: "Quiz", exact: true }).click();
      const quiz = page.getByRole("tabpanel", { name: "Quiz" });
      await quiz.getByRole("button", { name: "Generate quiz" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Generate a quiz" });
      await dialog.getByRole("spinbutton", { name: "Questions per topic" }).fill("4");
      await dialog.getByRole("button", { name: "Generate quiz" }).click();
      await quiz.getByRole("button", { name: "Start" }).first().click();
      await quiz.getByRole("radio", { name: "The claim the source supports" }).check();
      await quiz.getByRole("button", { name: "Check answer" }).click();
      await expect(quiz.getByRole("status")).toContainText("Correct");
      await shot(page, "quiz");

      await addFlashcards(page, path, 6);
      await goto(page, "/progress");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await shot(page, "progress");
    });

    test("space dashboard", async ({ page }) => {
      await goto(page, "/");
      await page.getByRole("textbox", { name: "New space" }).fill("Physics 101");
      await page.getByRole("button", { name: "Create space" }).click();
      await page
        .getByRole("link", { name: /Physics 101/ })
        .first()
        .click();
      await page.waitForURL(/\/spaces\//);
      const space = new URL(page.url()).pathname;
      for (const [title, body] of [
        ["Heat engines", "A heat engine turns some heat into work, never all of it."],
        ["Entropy", "Entropy measures disorder. In an isolated system it never decreases."],
      ] as const) {
        await goto(page, `${space}?tab=contents`);
        const panel = page.getByRole("tabpanel", { name: "Contents" });
        await panel.getByRole("tab", { name: "Paste" }).click();
        await panel
          .getByRole("textbox", { name: "Text to learn from" })
          .fill(`${title}\n\n${body}`);
        await panel.getByRole("button", { name: "Add text" }).click();
        await expect(panel.getByRole("link", { name: title })).toBeVisible({ timeout: 30_000 });
        const href = await panel.getByRole("link", { name: title }).getAttribute("href");
        if (href && title === "Entropy") await addFlashcards(page, href, 8);
      }
      await goto(page, `${space}?tab=overview`);
      await expect(page.getByRole("heading", { level: 1, name: "Physics 101" })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await shot(page, "space");
    });

    test("planner", async ({ page }) => {
      await goto(page, "/planner");
      await page.getByRole("button", { name: "New plan" }).click();
      const dialog = page.getByRole("dialog", { name: "New study plan" });
      await dialog.getByLabel("Name").fill("Final exam");
      const sunday = dialog.getByRole("button", { name: "Sun" });
      if ((await sunday.getAttribute("aria-pressed")) !== "true") await sunday.click();
      await dialog.getByRole("button", { name: "Create plan" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("region", { name: "Tasks for the day" })).toBeVisible();
      await shot(page, "planner");
    });

    test("whiteboard", async ({ page }) => {
      const path = await addPastedText(page, "Laws of thermodynamics");
      await goto(page, path);
      const tab = page.getByRole("tab", { name: "Whiteboard", exact: true });
      await tab.click();
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
      await expect(
        board.getByRole("application", { name: "Whiteboard canvas" }).getByText("Source overview"),
      ).toBeVisible();
      await expect(board.getByText(/is mapping the source/)).toBeHidden({ timeout: 30_000 });
      await expect(board.getByText("Generating")).toBeHidden();
      // Clear the selection Claude's run leaves, so the map is shown plainly.
      await board
        .getByRole("application", { name: "Whiteboard canvas" })
        .click({ position: { x: 40, y: 600 } });
      await page.keyboard.press("Escape");
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await shot(page, "whiteboard");
    });

    test("settings", async ({ page }) => {
      await goto(page, "/settings");
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await shot(page, "settings");
    });
  });
