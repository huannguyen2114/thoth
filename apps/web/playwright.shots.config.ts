import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * Landing-page screenshots (ADR-0044, docs/technical_design/23-website.md): `pnpm site:shots`.
 * The same scripted-LLM server as the e2e suite, on its own port and fresh data folder, at a
 * fixed 1440×900 viewport. Writes apps/site/public/shots/<id>-{light,dark}.png.
 */
const port = 3218;
const dataDir = join(tmpdir(), `thoth-shots-${port}`);
const webServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;
if (!webServer) throw new Error("playwright.config.ts has no webServer");

export default defineConfig({
  ...base,
  testDir: "./e2e",
  testMatch: "site-shots.ts",
  outputDir: "./e2e/.shots-results",
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  projects: [
    {
      name: "shots",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    ...webServer,
    command: String(webServer.command)
      .replaceAll(/thoth-e2e-\d+/g, `thoth-shots-${port}`)
      .replace(/-p \d+/, `-p ${port}`),
    url: `http://127.0.0.1:${port}`,
    env: { ...webServer.env, THOTH_DATA_DIR: dataDir },
  },
});
