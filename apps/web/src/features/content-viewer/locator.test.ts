import type { Locator } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { activeIndex, locatorLabel, locatorRef } from "./locator";

const times: { locator: Locator; idx: number }[] = [
  { idx: 0, locator: { type: "time", startSec: 0, endSec: 42 } },
  { idx: 1, locator: { type: "time", startSec: 42, endSec: 106 } },
  { idx: 2, locator: { type: "time", startSec: 106, endSec: 600 } },
];

describe("locator helpers", () => {
  it("labels each locator kind", () => {
    expect(locatorLabel({ type: "time", startSec: 201, endSec: 300 }, 0)).toBe("03:21");
    expect(locatorLabel({ type: "page", page: 5 }, 4)).toBe("p. 5");
    expect(locatorLabel({ type: "offset", start: 0, end: 9 }, 3)).toBe("§4");
  });

  it("maps paragraphs to 1-based jump targets", () => {
    expect(locatorRef({ type: "offset", start: 0, end: 9 }, 0)).toEqual({
      type: "paragraph",
      index: 1,
    });
  });

  it("finds the active row for a playback time", () => {
    expect(activeIndex(times, null)).toBe(-1);
    expect(activeIndex(times, { type: "time", sec: 0 })).toBe(0);
    expect(activeIndex(times, { type: "time", sec: 50 })).toBe(1);
    expect(activeIndex(times, { type: "time", sec: 9999 })).toBe(2);
    expect(activeIndex(times, { type: "page", page: 2 })).toBe(-1);
  });
});
