import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { goto, runCommand } from "./support";

/**
 * Annotations, links and backlinks (doc 21) on a small real PDF: highlight a passage, send it to
 * notes, jump back from the chip, open the note from the backlink, and export the annotated file.
 */
const FIXTURE = join(import.meta.dirname, "fixtures", "thermo-lecture.pdf");
const PASSAGE = "The second law says that the entropy of an isolated system never decreases.";

/** Uploads the fixture once per spec file and returns its content path. */
async function uploadPdf(page: Page): Promise<string> {
  await goto(page, "/");
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.locator("#pdf-upload").setInputFiles(FIXTURE);
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

/** Selects `text` inside the PDF text layer and ends the gesture like a mouse would. */
async function selectInPdf(page: Page, text: string) {
  const layer = page.locator(".pdf-text-layer[data-ready='true']").first();
  await expect(layer).toBeAttached({ timeout: 20_000 });
  await page.evaluate((want) => {
    const spans = [...document.querySelectorAll(".pdf-text-layer span")];
    const span = spans.find((s) => s.textContent?.includes(want));
    const node = span?.firstChild;
    if (!span || !node) throw new Error(`No text layer span with "${want}"`);
    const range = document.createRange();
    const at = (node.textContent ?? "").indexOf(want);
    range.setStart(node, at);
    range.setEnd(node, at + want.length);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    span.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  }, text);
  const bar = page.getByRole("toolbar", { name: "Selected text" });
  await expect(bar).toBeVisible();
  return bar;
}

test.describe
  .serial("PDF annotations, links and backlinks", () => {
    let path = "";

    test("highlight a passage, add it to notes, and the chip jumps back to it", async ({
      page,
    }) => {
      path = await uploadPdf(page);
      await goto(page, path);
      await runCommand(page, "Workspace: Quiz layout");

      const bar = await selectInPdf(page, PASSAGE);
      await bar.getByRole("button", { name: "Add to notes" }).click();

      const notes = page.getByRole("tabpanel", { name: "Notes" });
      const quote = notes
        .locator("blockquote")
        .filter({ hasText: "entropy of an isolated system" });
      await expect(quote).toBeVisible();
      const chip = quote.getByRole("button", { name: /^Open .*· p\.1$/ });
      await expect(chip).toBeVisible();
      await expect(notes.getByRole("status")).toHaveText("Saved");

      // The highlight is drawn on page 1.
      const mark = page.locator(
        "section[data-pdf-page='1'] [data-annotation-id] rect.pdf-highlight",
      );
      await expect(mark.first()).toBeAttached();

      // Scroll the PDF away, then the chip brings the highlight back and flashes it.
      await page.locator("section[data-pdf-page='2']").scrollIntoViewIfNeeded();
      await chip.click();
      await expect(
        page.locator("section[data-pdf-page='1'] .annotation-flash").first(),
      ).toBeAttached();
      await expect(page.locator("section[data-pdf-page='1']")).toBeInViewport();
    });

    test("the backlink marker opens the note at the quote", async ({ page }) => {
      await goto(page, path);
      await runCommand(page, "Workspace: Quiz layout");
      await runCommand(page, "Workspace: Show Text");

      const text = page.getByRole("region", { name: "Text" });
      const marker = text.getByRole("button", { name: "Quoted in 1 note. Open the note" });
      await expect(marker).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: "Referenced in 1 note" }).first(),
      ).toBeVisible();

      await marker.click();
      const notes = page.getByRole("tabpanel", { name: "Notes" });
      await expect(notes).toBeVisible();
      await expect(notes.locator("blockquote [data-thoth-link].ring-accent")).toBeVisible();
    });

    test("Download annotated PDF gives a PDF with the highlight in it", async ({ page }) => {
      await goto(page, path);
      const download = page.waitForEvent("download");
      await page.getByRole("link", { name: "Download annotated PDF" }).click();
      const file = await (await download).path();
      const bytes = await readFile(file);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.toString("latin1")).toContain("/Highlight");
    });
  });
