import { expect, test } from "@playwright/test";
import { addPastedText, goto, unique } from "./support";

test("history lists today's entries, newest first", async ({ page }) => {
  const title = unique("History source");
  await addPastedText(page, title);
  await goto(page, "/history");

  await expect(page.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  const today = page.getByRole("region", { name: /^Today · \d+$/ });
  await expect(today).toBeVisible();
  const entry = today.getByRole("link", { name: new RegExp(`Added content · ${title}`) });
  await expect(entry).toBeVisible();
  // Newest first: the entry just made is the first one.
  await expect(today.getByRole("listitem").first()).toContainText(title);
  await entry.click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
});
