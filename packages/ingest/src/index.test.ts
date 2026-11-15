import { ok } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { makePdf } from "./__fixtures__/make-pdf";
import { parseText, SourceIngestor } from "./index";

const offline = new SourceIngestor({
  youtube: {
    cueFetchers: [async () => ok([{ startSec: 0, durSec: 5, text: "Hi." }])],
    fetchTitle: async () => "A video",
  },
  fetch: async () => {
    throw new Error("no network in tests");
  },
  readFile: async (path) => {
    if (path === "/uploads/a.pdf") return makePdf([["Page one"]]);
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  },
});

describe("SourceIngestor", () => {
  it("reads PDFs from disk", async () => {
    const r = await offline.parse({ kind: "pdf", filePath: "/uploads/a.pdf", fileName: "a.pdf" });
    expect(r.ok && r.value.segments[0]?.locator).toEqual({ type: "page", page: 1 });
  });

  it("explains a missing upload", async () => {
    const r = await offline.parse({ kind: "pdf", filePath: "/nope.pdf", fileName: null });
    expect(!r.ok && r.error.message).toMatch(/Upload the PDF again/);
  });

  it("routes YouTube links", async () => {
    const r = await offline.parse({ kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(r.ok && r.value.title).toBe("A video");
  });

  it("routes web pages and maps a network error", async () => {
    const r = await offline.parse({ kind: "webpage", url: "https://example.com" });
    expect(!r.ok && r.error.retryable).toBe(true);
  });

  it("routes pasted text", async () => {
    const r = await offline.parse({ kind: "text", text: "Notes on cells\n\nCells divide." });
    expect(r.ok && r.value.title).toBe("Notes on cells");
  });
});

describe("parseText", () => {
  it("rejects blank text", () => {
    expect(parseText("   ").ok).toBe(false);
  });
});
