import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline } from "./markdown-lite";

describe("parseInline", () => {
  it("turns citation tokens into cite nodes", () => {
    expect(parseInline("ATP is made here [p.5] and there [03:21].")).toEqual([
      { type: "text", text: "ATP is made here " },
      { type: "cite", raw: "[p.5]", ref: { type: "page", page: 5 } },
      { type: "text", text: " and there " },
      { type: "cite", raw: "[03:21]", ref: { type: "time", sec: 201 } },
      { type: "text", text: "." },
    ]);
  });

  it("reads bold and code, and cites inside bold", () => {
    expect(parseInline("**ATP synthase [p.5]** uses `H+`")).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", text: "ATP synthase " },
          { type: "cite", raw: "[p.5]", ref: { type: "page", page: 5 } },
        ],
      },
      { type: "text", text: " uses " },
      { type: "code", text: "H+" },
    ]);
  });

  it("leaves HTML as plain text", () => {
    expect(parseInline("<b>hi</b>")).toEqual([{ type: "text", text: "<b>hi</b>" }]);
  });
});

describe("parseBlocks", () => {
  it("splits paragraphs and lists", () => {
    const blocks = parseBlocks(
      "Intro line\nsecond line\n\n- one [p.1]\n- two\n\n1. first\n2. second",
    );
    expect(blocks.map((b) => b.type)).toEqual(["p", "ul", "ol"]);
    expect(blocks[0]?.type === "p" && blocks[0].lines).toHaveLength(2);
    expect(blocks[1]?.type === "ul" && blocks[1].items).toHaveLength(2);
    expect(blocks[2]?.type === "ol" && blocks[2].items).toHaveLength(2);
  });

  it("keeps a list directly after a paragraph line apart from it", () => {
    const blocks = parseBlocks("Steps:\n- a\n- b\nAfter");
    expect(blocks.map((b) => b.type)).toEqual(["p", "ul", "p"]);
  });

  it("renders headings as their own block", () => {
    expect(parseBlocks("## Key ideas\nText")[0]?.type).toBe("heading");
  });
});
