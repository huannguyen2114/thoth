import { contentKinds } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { kindTone } from "../../../features/library/kind-tone";
import { formatCount } from "./format";

describe("formatCount (CountUp)", () => {
  it("shows whole numbers only, with separators", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(3.4999)).toBe("3");
    expect(formatCount(12.5)).toBe("13");
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});

describe("kindTone", () => {
  it("gives every content kind its own tone", () => {
    const tones = contentKinds.map((k) => kindTone[k]);
    expect(tones.every((t) => t?.startsWith("tone-"))).toBe(true);
    expect(new Set(tones).size).toBe(contentKinds.length);
  });
});
