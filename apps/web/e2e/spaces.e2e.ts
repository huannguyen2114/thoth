import { expect, type Page, test } from "@playwright/test";
import { makePdf } from "../../../packages/ingest/src/__fixtures__/make-pdf";
import { addFlashcards, addPastedText, goto, unique } from "./support";

/** Spaces v2 journeys (doc 22): space chat, dashboard, moving, tags, bulk add. */

async function createSpace(page: Page, name: string): Promise<string> {
  await goto(page, "/");
  await page.getByRole("textbox", { name: "New space" }).fill(name);
  await page.getByRole("button", { name: "Create space" }).click();
  await page
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname;
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tablist", { name: "Space" }).getByRole("tab", { name }).click();
}

/** Pastes a text through the space's own composer (Contents tab) and waits until it is ready. */
async function addTextToSpace(page: Page, spacePath: string, title: string, body: string[]) {
  await goto(page, `${spacePath}?tab=contents`);
  const panel = page.getByRole("tabpanel", { name: "Contents" });
  await panel.getByRole("tab", { name: "Paste" }).click();
  await panel
    .getByRole("textbox", { name: "Text to learn from" })
    .fill(`${title}\n\n${body.join("\n\n")}`);
  await panel.getByRole("button", { name: "Add text" }).click();
  await expect(panel.getByRole("link", { name: title })).toBeVisible({ timeout: 30_000 });
  const href = await panel.getByRole("link", { name: title }).getAttribute("href");
  if (!href) throw new Error("no link");
  return href;
}

test("space chat answers across contents with a chip that opens the cited content", async ({
  page,
}) => {
  const space = await createSpace(page, unique("Biology"));
  const cells = unique("Cells");
  const genes = unique("Genes");
  const cellsPath = await addTextToSpace(page, space, cells, [
    "Cells divide by mitosis to make two identical daughter cells.",
    "The membrane controls what enters the cell.",
  ]);
  const genesPath = await addTextToSpace(page, space, genes, [
    "Genes are stretches of DNA that code for proteins.",
    "Mutations change the DNA sequence of a gene.",
  ]);

  await openTab(page, "Chat");
  const chat = page.getByRole("tabpanel", { name: "Chat" });
  await chat
    .getByRole("textbox", { name: "Ask a question about this space" })
    .fill("How do cells and genes relate?");
  await chat.getByRole("button", { name: "Send question" }).click();
  await expect(chat.getByText("Read 2 sources in full.")).toBeVisible();

  // One chip per source; each opens its own content at the cited paragraph.
  const genesChip = chat.getByRole("link", { name: new RegExp(`${genes} · §1`) });
  await expect(genesChip).toBeVisible();
  await expect(chat.getByRole("link", { name: new RegExp(`${cells} · §1`) })).toHaveAttribute(
    "href",
    `${cellsPath}?at=${encodeURIComponent("[§1]")}`,
  );
  await genesChip.click();
  await expect(page).toHaveURL(`${genesPath}?at=${encodeURIComponent("[§1]")}`);
  await expect(page.getByRole("heading", { level: 1, name: genes })).toBeVisible();

  // The answer was saved with its links: reopening the chat shows the chips again.
  await goto(page, `${space}?tab=chat`);
  await chat.getByRole("button", { name: "History" }).click();
  await chat.getByRole("menuitem", { name: /How do cells and genes relate/ }).click();
  await expect(chat.getByRole("link", { name: new RegExp(`${genes} · §1`) })).toBeVisible();
});

test("the space dashboard shows the cards due in its contents", async ({ page }) => {
  const space = await createSpace(page, unique("Dash"));
  const title = unique("Dash source");
  const path = await addTextToSpace(page, space, title, [
    "Photosynthesis turns light into sugar.",
    "Chlorophyll absorbs red and blue light.",
  ]);
  await addFlashcards(page, path, 2);

  await goto(page, space);
  const overview = page.getByRole("tabpanel", { name: "Overview" });
  await expect(overview.getByRole("heading", { name: "Due for review" })).toBeVisible();
  await expect(overview.getByText("2 of 2 due")).toBeVisible();
  await expect(overview.getByRole("link", { name: "Review 2 cards" })).toBeVisible();
  await expect(overview.getByText("Continue where you left off")).toBeVisible();
});

test("moves a content to another space, with Undo, and by dragging it onto the sidebar", async ({
  page,
}) => {
  const target = unique("Target");
  const targetPath = await createSpace(page, target);
  const source = await createSpace(page, unique("Source"));
  const title = unique("Movable");
  await addTextToSpace(page, source, title, ["Something worth moving around."]);

  const panel = page.getByRole("tabpanel", { name: "Contents" });
  await panel.getByRole("combobox", { name: `Move ${title} to` }).selectOption({ label: target });
  await expect(panel.getByText(`Moved “${title}” to ${target}.`)).toBeVisible();
  await expect(panel.getByRole("link", { name: title })).toBeHidden();
  await panel.getByRole("button", { name: "Undo" }).click();
  await expect(panel.getByRole("link", { name: title })).toBeVisible();

  // Drag the row onto the target space in the sidebar.
  const row = panel.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) });
  const navTarget = page
    .getByRole("navigation", { name: "Spaces" })
    .getByRole("link", { name: target });
  await row.dragTo(navTarget);
  await expect(panel.getByRole("link", { name: title })).toBeHidden();

  await goto(page, `${targetPath}?tab=contents`);
  await expect(
    page.getByRole("tabpanel", { name: "Contents" }).getByRole("link", { name: title }),
  ).toBeVisible();
});

test("tags a content and filters the library by tag", async ({ page }) => {
  const tagged = unique("Tagged");
  const plain = unique("Plain");
  await addPastedText(page, tagged);
  await addPastedText(page, plain);
  const tag = unique("exam").replace(/\s+/g, "-");

  await goto(page, "/");
  await page.getByRole("button", { name: `Tags for ${tagged}` }).click();
  const dialog = page.getByRole("dialog", { name: `Tags for ${tagged}` });
  await dialog.getByRole("textbox", { name: "New tag" }).fill(tag);
  await dialog.getByRole("radio", { name: "Purple" }).first().check({ force: true });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: tag })).toBeChecked();
  await dialog.getByRole("button", { name: "Save tags" }).click();
  await expect(dialog).toBeHidden();

  const chip = page.getByRole("button", { name: tag, exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: tagged })).toBeVisible();
  await expect(page.getByRole("link", { name: plain })).toBeHidden();
  await chip.click();
  await expect(page.getByRole("link", { name: plain })).toBeVisible();
});

test("bulk adds two PDFs to a space, each a normal ingest", async ({ page }) => {
  const space = await createSpace(page, unique("Bulk"));
  await goto(page, `${space}?tab=contents`);
  const panel = page.getByRole("tabpanel", { name: "Contents" });
  await panel.getByRole("tab", { name: "Upload" }).click();
  const pdf = (title: string) => ({
    name: `${title}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from(
      makePdf([[`${title} first page about enzymes.`], ["Second page about catalysts."]], {
        title,
      }),
    ),
  });
  const a = unique("Bulk one");
  const b = unique("Bulk two");
  await panel.getByLabel("Choose PDFs").setInputFiles([pdf(a), pdf(b)]);
  const uploads = panel.getByRole("list", { name: "Uploads" });
  await expect(uploads.getByRole("listitem")).toHaveCount(2);
  await expect(uploads.getByText("Queued")).toHaveCount(2, { timeout: 30_000 });
  await expect(panel.getByRole("link", { name: a })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole("link", { name: b })).toBeVisible({ timeout: 30_000 });
});
