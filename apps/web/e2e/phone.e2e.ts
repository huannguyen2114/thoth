import { expect, test } from "@playwright/test";
import { goto } from "./support";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

test.describe("phone layout (375 px)", () => {
  test("the sidebar is a drawer behind the menu button", async ({ page }) => {
    await goto(page, "/");
    const review = page.getByRole("link", { name: "Review" });
    await expect(review).not.toBeInViewport();

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(review).toBeInViewport();

    await review.click();
    await expect(page).toHaveURL(/\/review$/);
    await expect(review).not.toBeInViewport();
  });

  test("the content workspace is one panel at a time, switched by a tab bar", async ({ page }) => {
    await goto(page, "/content/sample-pdf");
    const tabs = page.getByRole("tablist", { name: "Panels" });
    await expect(tabs).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "PDF" })).toBeVisible();

    await tabs.getByRole("tab", { name: "Chat" }).tap();
    await expect(page.getByRole("tabpanel", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "PDF" })).toBeHidden();

    // No horizontal scrolling at this width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
