import { describe, expect, it } from "vitest";
import { parseSplit, SPLIT_PRESETS, splitShow } from "./split-workspace";

describe("the Modern split", () => {
  it("shows a lower panel or a tool by switching its tab", () => {
    const s = SPLIT_PRESETS.study;
    expect(splitShow(s, "transcript")).toEqual({ lower: "transcript", tool: "chat" });
    expect(splitShow(s, "quiz")).toEqual({ lower: "chapters", tool: "quiz" });
    expect(splitShow(s, "source")).toBe(s);
  });
  it("reads a saved state, falling back to Study", () => {
    expect(parseSplit('{"lower":"transcript","tool":"notes"}')).toEqual({
      lower: "transcript",
      tool: "notes",
    });
    expect(parseSplit('{"lower":"nope","tool":"quiz"}')).toEqual({
      lower: "chapters",
      tool: "quiz",
    });
    expect(parseSplit(null)).toEqual({ lower: "chapters", tool: "chat" });
  });
  it("gives Watch + notes the transcript and notes", () => {
    expect(SPLIT_PRESETS.watch).toEqual({ lower: "transcript", tool: "notes" });
  });
});
