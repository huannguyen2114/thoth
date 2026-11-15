import { describe, expect, it } from "vitest";
import { citationToken, formatClock, parseCitations, parseClock } from "./citation";

describe("citations", () => {
  it("parses page, time and paragraph tokens with positions", () => {
    const text = "See [p.12] and [03:21], also [1:02:03] and [§4]. Not [x].";
    const refs = parseCitations(text).map((c) => c.ref);
    expect(refs).toEqual([
      { type: "page", page: 12 },
      { type: "time", sec: 201 },
      { type: "time", sec: 3723 },
      { type: "paragraph", index: 4 },
    ]);
    const first = parseCitations(text)[0];
    expect(first && text.slice(first.start, first.end)).toBe("[p.12]");
  });

  it("round-trips clocks", () => {
    expect(parseClock("03:21")).toBe(201);
    expect(formatClock(201)).toBe("03:21");
    expect(formatClock(3723)).toBe("1:02:03");
  });

  it("builds the token a prompt should request", () => {
    expect(citationToken({ type: "page", page: 3 })).toBe("[p.3]");
    expect(citationToken({ type: "time", startSec: 106, endSec: 200 })).toBe("[01:46]");
  });
});
