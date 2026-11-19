import { expect, test } from "@playwright/test";
import { goto, openPalette } from "./support";

test("Cmd+K finds a word that only the PDF's text contains and opens it at that page", async ({
  page,
}) => {
  await goto(page, "/");
  const palette = await openPalette(page);
  // "cristae" appears only on page 3 of the sample PDF, not in any title.
  await palette.getByRole("combobox").fill("cristae");
  const hit = palette.getByRole("option", { name: /cristae.* p\.3 · Sample: Cell Energy/ });
  await expect(hit).toBeVisible();
  await hit.click();

  await expect(page).toHaveURL(/\/content\/sample-pdf\?at=/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sample: Cell Energy and Mitochondria" }),
  ).toBeVisible();
  await expect(page.getByRole("article", { name: "Page 3" })).toBeInViewport({ ratio: 0.5 });
});
