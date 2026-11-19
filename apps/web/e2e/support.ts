import { expect, type Page } from "@playwright/test";

/** A name no earlier run or spec used, so specs that add data never collide (also on a retry). */
export const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Waits until React has taken over the page, so the first click is not lost to hydration. */
export async function hydrated(page: Page) {
  await page.waitForFunction(() =>
    Object.keys(document).some((k) => k.startsWith("__reactContainer")),
  );
}

export async function goto(page: Page, url: string) {
  await page.goto(url);
  await hydrated(page);
}

/** Cmd+K on a Mac, Ctrl+K elsewhere. Retries until the shortcut listener is attached. */
export async function openPalette(page: Page) {
  const palette = page.getByRole("dialog", { name: "Search or run a command" });
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return palette;
}

/** Runs one palette command by its visible label, for example "Workspace: Quiz layout". */
export async function runCommand(page: Page, label: string) {
  const palette = await openPalette(page);
  await palette.getByRole("combobox").fill(label);
  await palette.getByRole("option", { name: label }).click();
  await expect(palette).toBeHidden();
}

/**
 * Adds a pasted text through the home page and waits until it is ready.
 * Returns the content's path, for example `/content/abc`.
 */
export async function addPastedText(page: Page, title: string, paragraphs?: string[]) {
  await goto(page, "/");
  await page.getByRole("tab", { name: "Paste" }).click();
  const body = (
    paragraphs ?? [
      "Entropy measures the disorder of a system. The second law of thermodynamics says that the entropy of an isolated system never decreases.",
      "Heat flows from a hot body to a cold body without help. An engine turns some of that heat into work, but never all of it.",
      "A refrigerator moves heat the other way, so it needs work from outside to do it.",
    ]
  ).join("\n\n");
  await page.getByRole("textbox", { name: "Text to learn from" }).fill(`${title}\n\n${body}`);
  await page.getByRole("button", { name: "Add text" }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) });
  await expect(row).toContainText("Ready");
  const href = await row.getByRole("link", { name: title }).getAttribute("href");
  if (!href) throw new Error("The new content has no link.");
  return href;
}

/** Generates a flashcard deck with `count` cards for the content at `path`, through the UI. */
export async function addFlashcards(page: Page, path: string, count: number) {
  await goto(page, path);
  await page.getByRole("tab", { name: "Flashcards", exact: true }).click();
  const cards = page.getByRole("tabpanel", { name: "Flashcards" });
  await cards.getByRole("button", { name: "Generate flashcards" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Generate flashcards" });
  await dialog.getByRole("spinbutton", { name: "Number of cards" }).fill(String(count));
  await dialog.getByRole("button", { name: "Generate flashcards" }).click();
  await expect(cards.getByText(`${count} cards · ${count} due`)).toBeVisible();
  return cards;
}
