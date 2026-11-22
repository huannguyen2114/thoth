// Renders design/brand/thoth-icon.svg to a 1024 px PNG (design/brand/thoth-icon-1024.png) with
// Playwright's Chromium, for `tauri icon`, which makes the desktop app's icns, ico and pngs.
// Run: node tools/render-brand-icon.mjs && pnpm --filter @thoth/desktop exec tauri icon ../../design/brand/thoth-icon-1024.png
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve("apps/web/package.json"));
const { chromium } = require("@playwright/test");

const svg = readFileSync(resolve("design/brand/thoth-icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1024, height: 1024 },
  deviceScaleFactor: 1,
});
await page.setContent(
  `<html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, 'width="1024" height="1024"')}</body></html>`,
);
await page
  .locator("svg")
  .screenshot({ path: resolve("design/brand/thoth-icon-1024.png"), omitBackground: true });
await browser.close();
console.log("Wrote design/brand/thoth-icon-1024.png");
