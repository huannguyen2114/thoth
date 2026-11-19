import { expect, test } from "@playwright/test";
import { goto } from "./support";

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
