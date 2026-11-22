/**
 * Pure parsers for build-time facts (ADR-0044). No file access here, so they are unit-tested;
 * `build-data.ts` reads the files and calls these.
 */

export interface Release {
  phase: number;
  title: string;
  /** ISO date, e.g. "2026-11-21". */
  date: string;
  points: string[];
}

/** Removes Markdown emphasis and code ticks: "**Done** `x`" -> "Done x". */
export function plain(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<![*\w])\*(.+?)\*(?!\w)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s*\(ADRs?[ -][^)]*\)/g, "")
    .trim();
}

const HEADING = /^### Phase (\d+): (.+?) — DONE (\d{4}-\d{2}-\d{2})(.*)$/;

/**
 * "What's new" from docs/plan/roadmap.md: every `### Phase N: Title — DONE yyyy-mm-dd` heading,
 * newest first. A phase whose section is a plan (it has a "Done when" line) shows its title only;
 * a phase written as a summary of what shipped shows its top-level bullets as well.
 */
export function parseRoadmap(markdown: string): Release[] {
  const lines = markdown.split("\n");
  const out: Release[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING.exec(lines[i] ?? "");
    if (!m) continue;
    const section: string[] = [];
    for (let j = i + 1; j < lines.length && !/^#{1,3} /.test(lines[j] ?? ""); j++) {
      section.push(lines[j] ?? "");
    }
    const isPlan = section.some((l) => /Done when/i.test(l));
    const points = isPlan
      ? []
      : section.filter((l) => l.startsWith("- ")).map((l) => plain(l.slice(2)));
    out.push({
      phase: Number(m[1]),
      title: plain((m[2] ?? "").replace(/\s*\(about [^)]*\)/, "")),
      date: m[3] ?? "",
      points,
    });
  }
  return out.sort((a, b) => b.phase - a.phase);
}

/** Every `### Phase N` heading marked DONE, by number (for the freshness gate). */
export function donePhases(markdown: string): number[] {
  return markdown
    .split("\n")
    .flatMap((l) => {
      const m = /^### Phase (\d+):.*\bDONE\b/.exec(l);
      return m ? [Number(m[1])] : [];
    })
    .sort((a, b) => a - b);
}

/** The `version` of apps/desktop/src-tauri/tauri.conf.json. */
export function parseTauriVersion(json: string): string {
  const v = (JSON.parse(json) as { version?: unknown }).version;
  if (typeof v !== "string" || !/^\d+\.\d+\.\d+/.test(v)) {
    throw new Error("tauri.conf.json has no valid version");
  }
  return v;
}

/** The `target:` values of the desktop.yml build matrix. */
export function parseMatrixTargets(yaml: string): string[] {
  return [...yaml.matchAll(/^\s+target:\s*([A-Za-z0-9_.-]+)\s*$/gm)].map((m) => m[1] ?? "");
}

/** Doc numbers of docs/technical_design/NN-*.md file names. */
export function docNumbers(fileNames: string[]): number[] {
  return fileNames
    .flatMap((f) => {
      const m = /^(\d{2})-.+\.md$/.exec(f);
      return m ? [Number(m[1])] : [];
    })
    .sort((a, b) => a - b);
}

/** Shot ids that `site-shots.ts` saves, found from its `shot("<id>"` calls. */
export function shotsInScript(source: string): string[] {
  return [...source.matchAll(/\bshot\(\s*page\s*,\s*"([a-z-]+)"/g)].map((m) => m[1] ?? "");
}
