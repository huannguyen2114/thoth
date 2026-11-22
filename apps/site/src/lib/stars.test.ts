import { describe, expect, it } from "vitest";
import { formatStars } from "./stars";

describe("formatStars", () => {
  it("shows small counts as they are and large ones in thousands", () => {
    expect(formatStars(0)).toBe("0");
    expect(formatStars(999)).toBe("999");
    expect(formatStars(1000)).toBe("1k");
    expect(formatStars(1234)).toBe("1.2k");
    expect(formatStars(15_200)).toBe("15k");
  });
});
