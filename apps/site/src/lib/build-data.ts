import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRoadmap, parseTauriVersion, type Release } from "./parse.ts";

/** Repo root, from apps/site (where `next build` runs). */
const ROOT = resolve(process.cwd(), "../..");

/** Facts read from the repo at build time, so the page never types them (ADR-0044). */
export function buildData(): { version: string; releases: Release[] } {
  const version = parseTauriVersion(
    readFileSync(resolve(ROOT, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
  );
  const releases = parseRoadmap(readFileSync(resolve(ROOT, "docs/plan/roadmap.md"), "utf8"));
  return { version, releases };
}
