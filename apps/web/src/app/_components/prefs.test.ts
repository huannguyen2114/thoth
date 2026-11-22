import { describe, expect, it } from "vitest";
import { parseAccent, parseSkin } from "./prefs";

describe("theme preferences", () => {
  it("falls back to Hearth for a missing or unknown skin", () => {
    expect(parseSkin(null)).toBe("hearth");
    expect(parseSkin("neon")).toBe("hearth");
    expect(parseSkin("modern")).toBe("modern");
  });
  it("falls back to graphite for a missing or unknown accent", () => {
    expect(parseAccent(null)).toBe("graphite");
    expect(parseAccent("pink")).toBe("graphite");
    expect(parseAccent("violet")).toBe("violet");
  });
});
