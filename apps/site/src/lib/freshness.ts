import type { Site } from "@content/site";
import { donePhases, parseRoadmap } from "./parse.ts";

/** The repo facts the freshness gate compares the site against (ADR-0044). */
export interface RepoFacts {
  /** Numbers of docs/technical_design/NN-*.md. */
  docs: number[];
  roadmap: string;
  /** Shot ids site-shots.ts produces. */
  shots: string[];
  /** Shot files present in apps/site/public/shots. */
  shotFiles: string[];
  /** desktop.yml matrix targets. */
  targets: string[];
}

/** Every reason the site is stale. Empty means fresh. Pure, so it is unit-tested. */
export function staleness(site: Site, facts: RepoFacts): string[] {
  const problems: string[] = [];

  const covered = new Set([...site.features.flatMap((f) => f.docs), ...site.notUserFacing]);
  for (const n of facts.docs) {
    if (!covered.has(n)) {
      problems.push(
        `docs/technical_design/${String(n).padStart(2, "0")}-*.md is not on the site. Add or extend a feature in apps/site/content/site.ts (its "docs"), or list it in "notUserFacing".`,
      );
    }
  }
  for (const n of covered) {
    if (!facts.docs.includes(n)) problems.push(`site.ts names doc ${n}, which does not exist.`);
  }

  const done = donePhases(facts.roadmap);
  const shown = new Set(parseRoadmap(facts.roadmap).map((r) => r.phase));
  for (const p of done) {
    if (!shown.has(p)) {
      problems.push(
        `Roadmap phase ${p} is DONE but "What's new" cannot read it. Use the heading form "### Phase ${p}: Title — DONE yyyy-mm-dd".`,
      );
    }
  }

  const made = new Set(facts.shots);
  for (const f of site.features) {
    if (!made.has(f.shot)) {
      problems.push(
        `Feature "${f.id}" uses screenshot "${f.shot}", which apps/web/e2e/site-shots.ts does not take.`,
      );
    }
    for (const scheme of ["light", "dark"]) {
      if (!facts.shotFiles.includes(`${f.shot}-${scheme}.png`)) {
        problems.push(
          `apps/site/public/shots/${f.shot}-${scheme}.png is missing. Run pnpm site:shots.`,
        );
      }
    }
  }

  const targets = new Set(facts.targets);
  for (const p of site.platforms) {
    if (!targets.has(p.target)) {
      problems.push(
        `Download "${p.label}" needs target ${p.target}, which desktop.yml does not build.`,
      );
    }
  }
  for (const t of targets) {
    if (!site.platforms.some((p) => p.target === t)) {
      problems.push(`desktop.yml builds ${t}, but the site offers no download for it.`);
    }
  }
  return problems;
}
