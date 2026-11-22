import { describe, expect, it } from "vitest";
import {
  docNumbers,
  donePhases,
  parseMatrixTargets,
  parseRoadmap,
  parseTauriVersion,
  plain,
  shotsInScript,
} from "./parse.ts";

const ROADMAP = `
### Phase 2: Ingestion + library (about 2 days) — DONE 2026-11-15

- The home prompt box with **Upload** (PDF).
- **Done when:** adding a link works.

### Phase 10: Desktop app, providers — DONE 2026-11-21

- A Tauri 2 desktop app (ADRs 0036, 0043; doc 19).
- \`thoth:\` links back to the source.

### Phase 11: Something planned

- Not done yet.
`;

describe("parseRoadmap", () => {
  it("lists DONE phases newest first, with summary bullets only for shipped-summary sections", () => {
    const r = parseRoadmap(ROADMAP);
    expect(r.map((x) => x.phase)).toEqual([10, 2]);
    expect(r[0]).toEqual({
      phase: 10,
      title: "Desktop app, providers",
      date: "2026-11-21",
      points: ["A Tauri 2 desktop app.", "thoth: links back to the source."],
    });
    expect(r[1]).toMatchObject({ title: "Ingestion + library", points: [] });
  });

  it("finds DONE phases for the gate", () => {
    expect(donePhases(ROADMAP)).toEqual([2, 10]);
  });
});

describe("small parsers", () => {
  it("strips Markdown and ADR references", () => {
    expect(plain("**Bold** and `code` and [a link](x) (ADR-0001)")).toBe(
      "Bold and code and a link",
    );
  });

  it("reads the desktop version and rejects a bad one", () => {
    expect(parseTauriVersion('{"version":"0.2.1"}')).toBe("0.2.1");
    expect(() => parseTauriVersion("{}")).toThrow();
  });

  it("reads matrix targets, doc numbers and shot ids", () => {
    expect(
      parseMatrixTargets("  include:\n    - name: x\n      target: aarch64-apple-darwin\n"),
    ).toEqual(["aarch64-apple-darwin"]);
    expect(docNumbers(["README.md", "07-chat.md", "23-website.md"])).toEqual([7, 23]);
    expect(shotsInScript('await shot(page, "chat");\nawait shot( page, "pdf" )')).toEqual([
      "chat",
      "pdf",
    ]);
  });
});
