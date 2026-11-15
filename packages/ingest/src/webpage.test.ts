import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type FetchLike, parseHtml, parseWebpage } from "./webpage";

const html = readFileSync(join(import.meta.dirname, "__fixtures__", "article.html"), "utf8");
const URL_ = "https://science.example.com/sleep";

const respond =
  (body: string, init: ResponseInit = {}): FetchLike =>
  async () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      ...init,
    });

describe("parseHtml", () => {
  it("keeps the article, drops navigation and footer, and uses offset locators", () => {
    const r = parseHtml(html, URL_);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { title, segments } = r.value;
    expect(title).toMatch(/How sleep shapes memory/);
    const all = segments.map((s) => s.text).join("\n\n");
    expect(all).toContain("Sleep is not a pause for the brain.");
    expect(all).toContain("Keep a regular bedtime");
    expect(all).not.toContain("Subscribe to our newsletter");
    expect(all).not.toContain("All rights reserved");
    expect(all).not.toContain("track(");
    expect(segments.map((s) => s.idx)).toEqual(segments.map((_, i) => i));

    // Offsets are increasing, non-overlapping positions in the article text.
    let prevEnd = -1;
    for (const s of segments) {
      expect(s.locator.type).toBe("offset");
      if (s.locator.type !== "offset") continue;
      expect(s.locator.start).toBeGreaterThan(prevEnd);
      expect(s.locator.end - s.locator.start).toBe(s.text.length);
      prevEnd = s.locator.end;
    }
  });

  it("fails with a Paste suggestion when there is no readable text", () => {
    const r = parseHtml("<html><body><nav>Home</nav></body></html>", URL_);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/Paste/);
  });
});

describe("parseWebpage", () => {
  it("downloads and parses an HTML page", async () => {
    const r = await parseWebpage(URL_, respond(html));
    expect(r.ok && r.value.segments.length).toBeGreaterThan(0);
  });

  it("marks network errors as retryable", async () => {
    const r = await parseWebpage(URL_, async () => {
      throw new TypeError("fetch failed");
    });
    expect(!r.ok && r.error.retryable).toBe(true);
  });

  it("marks 404 as permanent and 503 as retryable", async () => {
    const notFound = await parseWebpage(URL_, respond("", { status: 404 }));
    expect(!notFound.ok && notFound.error.retryable).toBe(false);
    const down = await parseWebpage(URL_, respond("", { status: 503 }));
    expect(!down.ok && down.error.retryable).toBe(true);
  });

  it("points PDFs to Upload", async () => {
    const r = await parseWebpage(
      URL_,
      respond("%PDF", { headers: { "content-type": "application/pdf" } }),
    );
    expect(!r.ok && r.error.message).toMatch(/Upload/);
  });

  it("rejects other file types", async () => {
    const r = await parseWebpage(
      URL_,
      respond("{}", { headers: { "content-type": "application/json" } }),
    );
    expect(r.ok).toBe(false);
  });
});
