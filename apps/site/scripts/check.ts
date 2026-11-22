/**
 * pnpm site:check — fails when the landing page is stale (ADR-0044, doc 23).
 * Reads the repo, then asks the pure `staleness` check what is out of date.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { landing } from "../content/landing.ts";
import { site } from "../content/site.ts";
import { staleness } from "../src/lib/freshness.ts";
import { docNumbers, parseMatrixTargets, shotsInScript } from "../src/lib/parse.ts";

const root = resolve(import.meta.dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const problems = staleness(site, {
  docs: docNumbers(readdirSync(resolve(root, "docs/technical_design"))),
  roadmap: read("docs/plan/roadmap.md"),
  shots: shotsInScript(read("apps/web/e2e/site-shots.ts")),
  shotFiles: readdirSync(resolve(root, "apps/site/public/shots")),
  targets: parseMatrixTargets(read(".github/workflows/desktop.yml")),
  story: landing.story.flatMap((b) =>
    b.steps.map((s) => ({ shot: s.shot, ...("at" in s && s.at ? { at: s.at } : {}) })),
  ),
  hotspots: JSON.parse(read("apps/site/content/hotspots.json")),
});

if (problems.length > 0) {
  console.error(`The landing page is stale (${problems.length}):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nSee docs/technical_design/23-website.md.");
  process.exit(1);
}
console.log("The landing page is up to date.");
