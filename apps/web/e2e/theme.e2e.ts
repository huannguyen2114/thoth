import { expect, test } from "@playwright/test";
import { addPastedText, goto, runCommand, unique } from "./support";

test("the theme toggle cycles system, light, dark and survives a reload", async ({ page }) => {
  await goto(page, "/");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", /.+/);

  await page.getByRole("button", { name: "System theme" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByRole("button", { name: "Light theme" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBg).not.toBe(lightBg);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark theme" })).toBeVisible();

  // Back to system, so nothing leaks into the next test (each test has its own storage anyway).
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
});

test("the Modern look changes home and the content page, and survives a reload", async ({
  page,
}) => {
  // ADR-0050: pick it in Settings › Appearance.
  const title = unique("Modern look");
  const path = await addPastedText(page, title);
  await goto(page, "/settings");
  // Click the card, as a person would; the radio inside it is visually hidden.
  await page
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: /^Modern/ }) })
    .click();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-skin", "modern");

  // Accents are Modern's: picking one sets data-accent.
  await page
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: "Violet" }) })
    .click();
  await expect(html).toHaveAttribute("data-accent", "violet");

  await goto(page, "/");
  await expect(html).toHaveAttribute("data-skin", "modern");
  await expect(
    page.getByRole("heading", { level: 1, name: "What do you want to learn today?" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Recent sources" })).toContainText(title);

  // The content page is a split: tabbed tools beside the source, no dock.
  await goto(page, path);
  const tools = page.getByRole("tablist", { name: "Tools" });
  await expect(tools).toBeVisible();
  await tools.getByRole("tab", { name: "Notes" }).click();
  await expect(tools.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  await expect(tools.getByRole("tab", { name: "Quiz" })).toHaveAttribute("aria-selected", "true");

  // Back to Hearth from the palette.
  await runCommand(page, "Use the Hearth look");
  await expect(html).not.toHaveAttribute("data-skin", /.+/);
});
