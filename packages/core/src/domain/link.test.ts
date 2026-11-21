import { describe, expect, it } from "vitest";
import type { AnnotationId, ContentId, SpaceId, StudySetId } from "../shared/id";
import {
  findQuote,
  formatLink,
  parseLink,
  parseLinks,
  parseLocatorParam,
  quoteAt,
  type SourceAnchor,
} from "./link";

const cid = "3f2b8c1e-0000-4000-8000-000000000001" as ContentId;

describe("formatLink / parseLink", () => {
  const cases: [string, SourceAnchor][] = [
    [`thoth:c/${cid}`, { kind: "content", contentId: cid, locator: null }],
    [
      `thoth:c/${cid}?at=p.3`,
      { kind: "content", contentId: cid, locator: { type: "page", page: 3 } },
    ],
    [
      `thoth:c/${cid}?at=t.201`,
      { kind: "content", contentId: cid, locator: { type: "time", startSec: 201, endSec: 201 } },
    ],
    [
      `thoth:c/${cid}?at=par.4`,
      {
        kind: "content",
        contentId: cid,
        locator: { type: "offset", start: 0, end: 0, paragraph: 4 },
      },
    ],
    ["thoth:a/hl-1", { kind: "annotation", annotationId: "hl-1" as AnnotationId }],
    ["thoth:space/s1", { kind: "space", spaceId: "s1" as SpaceId }],
  ];

  it.each(cases)("round-trips %s", (href, anchor) => {
    expect(formatLink(anchor)).toBe(href);
    expect(parseLink(href)).toEqual({ ok: true, value: anchor });
  });

  it("keeps a quote on set links, encoded", () => {
    const anchor: SourceAnchor = {
      kind: "set",
      setId: "set1" as StudySetId,
      quote: { exact: "a & b = c?", prefix: "", suffix: "" },
    };
    const href = formatLink(anchor);
    expect(href).toBe("thoth:s/set1?q=a+%26+b+%3D+c%3F");
    expect(parseLink(href)).toEqual({ ok: true, value: anchor });
  });

  it("accepts citation-style positions typed by hand", () => {
    expect(parseLocatorParam("03:21")).toEqual({ type: "time", startSec: 201, endSec: 201 });
    expect(parseLocatorParam("§2")).toEqual({ type: "offset", start: 0, end: 0, paragraph: 2 });
    expect(parseLocatorParam("p.0")).toBeNull();
  });

  it.each([
    "https://example.com",
    "thoth:",
    "thoth:x/1",
    "thoth:c/",
    "thoth:c/a/b",
    "thoth:c/has space",
    `thoth:c/${cid}?at=nope`,
  ])("rejects %s", (href) => {
    expect(parseLink(href).ok).toBe(false);
  });
});

describe("parseLinks", () => {
  it("finds thoth links in Markdown and skips others", () => {
    const md = `See [Lecture · p.3](thoth:c/${cid}?at=p.3), [web](https://x.y) and [bad](thoth:zz/1).`;
    const links = parseLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ label: "Lecture · p.3", href: `thoth:c/${cid}?at=p.3` });
    expect(md.slice(links[0]?.start, links[0]?.end)).toBe(`[Lecture · p.3](thoth:c/${cid}?at=p.3)`);
  });
});

describe("quotes", () => {
  const text = "The cell is the unit of life. The cell membrane keeps the cell intact.";

  it("re-finds the right repeat using its context", () => {
    const start = text.indexOf("cell", 10); // the second "cell"
    const q = quoteAt(text, start, start + 4);
    expect(findQuote(text, q)).toEqual({ start, end: start + 4 });
  });

  it("still finds a passage after the text around it changes", () => {
    const q = quoteAt(text, 4, 28);
    const edited = `Intro. ${text}`;
    expect(findQuote(edited, q)).toEqual({ start: 11, end: 35 });
  });

  it("returns null when the passage is gone", () => {
    expect(findQuote("nothing here", { exact: "cell", prefix: "", suffix: "" })).toBeNull();
  });
});
