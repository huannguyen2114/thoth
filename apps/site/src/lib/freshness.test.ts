import { describe, expect, it } from "vitest";
import { site } from "../../content/site.ts";
import { type RepoFacts, staleness } from "./freshness.ts";

const shots = [...new Set(site.features.map((f) => f.shot))];
const fresh: RepoFacts = {
  docs: [...new Set([...site.features.flatMap((f) => f.docs), ...site.notUserFacing])].sort(
    (a, b) => a - b,
  ),
  roadmap: "### Phase 1: First — DONE 2026-11-15\n\n- Shipped.\n",
  shots,
  shotFiles: shots.flatMap((s) => [`${s}-light.png`, `${s}-dark.png`]),
  targets: [...new Set(site.platforms.map((p) => p.target))],
  story: [{ shot: "chat", at: "chip" }, { shot: "workspace" }],
  hotspots: { chat: { chip: { x: 0, y: 0, w: 0, h: 0 } } },
};

describe("staleness (the site:check gate)", () => {
  it("passes when the site covers the repo", () => {
    expect(staleness(site, fresh)).toEqual([]);
  });

  it("fails when a new technical-design doc has no place on the site", () => {
    const problems = staleness(site, { ...fresh, docs: [...fresh.docs, 24] });
    expect(problems).toEqual([expect.stringContaining("24-*.md is not on the site")]);
  });

  it("fails when a DONE phase cannot be read for What's new", () => {
    const problems = staleness(site, { ...fresh, roadmap: "### Phase 3: Odd heading DONE\n" });
    expect(problems.join("\n")).toContain("Roadmap phase 3 is DONE");
  });

  it("fails when a screenshot is not taken or its file is missing", () => {
    const problems = staleness(site, {
      ...fresh,
      shots: shots.filter((s) => s !== "chat"),
      shotFiles: fresh.shotFiles.filter((f) => f !== "chat-dark.png"),
    });
    expect(problems.join("\n")).toContain('uses screenshot "chat"');
    expect(problems.join("\n")).toContain("chat-dark.png is missing");
  });

  it("fails when the downloads drift from the desktop build matrix", () => {
    const problems = staleness(site, {
      ...fresh,
      targets: [...fresh.targets, "riscv64gc-unknown-linux-gnu"],
    });
    expect(problems).toEqual([expect.stringContaining("riscv64gc")]);
  });

  it("fails when a walkthrough frame is not taken or its cursor target was not recorded", () => {
    const problems = staleness(site, {
      ...fresh,
      story: [{ shot: "nope" }, { shot: "chat", at: "missing" }],
    });
    expect(problems.join("\n")).toContain('shows screenshot "nope"');
    expect(problems.join("\n")).toContain('points at "missing" on "chat"');
  });
});
