import { describe, expect, it } from "vitest";
import type { ContentId } from "../../shared/id";
import { addContent, MAX_PASTE_CHARS, retryContent } from "./add-content";
import { makeDeps } from "./fakes.test-support";
import { detectLinkKind, youtubeVideoId } from "./source-url";

describe("addContent", () => {
  it("creates a pending YouTube content and queues an ingest job", async () => {
    const d = makeDeps();
    const r = await addContent(d, { kind: "link", url: " https://youtu.be/dQw4w9WgXcQ " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      kind: "youtube",
      status: "pending",
      sourceUrl: "https://youtu.be/dQw4w9WgXcQ",
      spaceId: null,
    });
    expect(d.jobs.rows).toHaveLength(1);
    expect(d.jobs.rows[0]).toMatchObject({ kind: "ingest", payload: { contentId: r.value.id } });
  });

  it("detects a web page link and uses the host and path as a placeholder title", async () => {
    const d = makeDeps();
    const r = await addContent(d, { kind: "link", url: "https://www.example.com/articles/sleep" });
    expect(r.ok && r.value).toMatchObject({ kind: "webpage", title: "example.com/articles/sleep" });
  });

  it("rejects a link that is not http(s)", async () => {
    const d = makeDeps();
    for (const url of ["youtube video", "ftp://example.com/x", "javascript:alert(1)"]) {
      const r = await addContent(d, { kind: "link", url });
      expect(!r.ok && r.error.code).toBe("validation");
    }
    expect(d.contents.rows).toHaveLength(0);
    expect(d.jobs.rows).toHaveLength(0);
  });

  it("keeps pasted text in the job payload", async () => {
    const d = makeDeps();
    const r = await addContent(d, { kind: "text", text: "Cells\n\nCells divide." });
    expect(r.ok && r.value.kind).toBe("text");
    expect(d.jobs.rows[0]?.payload).toMatchObject({ text: "Cells\n\nCells divide." });
  });

  it("rejects blank and oversized text with fix-it messages", async () => {
    const d = makeDeps();
    const blank = await addContent(d, { kind: "text", text: "  \n " });
    expect(!blank.ok && blank.error.message).toBe("Paste some text first.");
    const huge = await addContent(d, { kind: "text", text: "a".repeat(MAX_PASTE_CHARS + 1) });
    expect(!huge.ok && huge.error.message).toMatch(/Paste a shorter part/);
  });

  it("creates a PDF content titled after the file and keeps the space", async () => {
    const d = makeDeps();
    const r = await addContent(d, {
      kind: "pdf",
      filePath: "/data/uploads/abc.pdf",
      fileName: "Week 3 notes.PDF",
      spaceId: "space-1",
    });
    expect(r.ok && r.value).toMatchObject({
      kind: "pdf",
      title: "Week 3 notes",
      filePath: "/data/uploads/abc.pdf",
      spaceId: "space-1",
    });
  });
});

describe("retryContent", () => {
  it("requeues a failed content", async () => {
    const d = makeDeps();
    const added = await addContent(d, { kind: "link", url: "https://example.com/a" });
    if (!added.ok) throw new Error("setup");
    await d.contents.setStatus(added.value.id, "failed", "Boom.");
    const r = await retryContent(d, added.value.id);
    expect(r.ok && r.value).toMatchObject({ status: "pending", error: null });
    expect(d.contents.rows[0]).toMatchObject({ status: "pending", error: null });
    expect(d.jobs.rows).toHaveLength(2);
    expect(d.jobs.rows[1]?.payload).toEqual({ contentId: added.value.id });
  });

  it("refuses contents that are not failed, and unknown ids", async () => {
    const d = makeDeps();
    const added = await addContent(d, { kind: "link", url: "https://example.com/a" });
    if (!added.ok) throw new Error("setup");
    expect((await retryContent(d, added.value.id)).ok).toBe(false);
    const missing = await retryContent(d, "nope" as ContentId);
    expect(!missing.ok && missing.error.code).toBe("not_found");
  });
});

describe("detectLinkKind", () => {
  it("tells YouTube videos from other pages", () => {
    expect(detectLinkKind("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(detectLinkKind("https://www.youtube.com/@channel")).toBe("webpage");
    expect(detectLinkKind("http://example.com")).toBe("webpage");
    expect(detectLinkKind("example.com")).toBeNull();
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
});
