import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (ADR-0028, docs/technical_design/15-e2e-tests.md).
 * The server runs with THOTH_LLM=scripted on a fresh data folder, seeded with the two samples.
 * CI sets E2E_SERVER=start to serve the production build; locally the dev server is used.
 */
const port = Number(process.env.E2E_PORT ?? 3217);
const baseURL = `http://127.0.0.1:${port}`;
const dataDir = join(tmpdir(), `thoth-e2e-${port}`);
const mode = process.env.E2E_SERVER === "start" ? "start" : "dev";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "./e2e/.results",
  // One worker: the specs share one server and database, and add data, so they must not race.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A fresh data folder every run, seeded before the server starts. No passcode, no API key.
    command: [
      `rm -rf "${dataDir}"`,
      `mkdir -p "${dataDir}"`,
      "pnpm --filter @thoth/db seed",
      `pnpm --filter @thoth/web exec next ${mode} -H 127.0.0.1 -p ${port}`,
    ].join(" && "),
    cwd: "../..",
    url: baseURL,
    // E2E_REUSE=1 attaches to a server you started yourself (faster to debug a spec).
    reuseExistingServer: Boolean(process.env.E2E_REUSE),
    timeout: 180_000,
    stderr: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
    env: {
      THOTH_LLM: "scripted",
      THOTH_DATA_DIR: dataDir,
      THOTH_PASSCODE: "",
      ANTHROPIC_API_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
