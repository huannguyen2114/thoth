import { Readability } from "@mozilla/readability";
import {
  err,
  type IngestFailure,
  ingestFailure,
  ok,
  type ParsedSource,
  type Result,
} from "@thoth/core";
import { JSDOM, VirtualConsole } from "jsdom";
import { normalizeWhitespace, paragraphSegments } from "./text";

const BLOCKS = "h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,figcaption,dt,dd,td,th";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Extracts the readable article from HTML with Readability and returns paragraph segments.
 * Offsets point into the article text: the readable blocks (paragraphs, list items, headings)
 * joined by blank lines. `[§n]` citations scroll to the segment, not to raw HTML.
 */
export function parseHtml(html: string, url: string): Result<ParsedSource, IngestFailure> {
  // Pages often have broken CSS or scripts; jsdom would log them to the server console.
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const pageTitle = dom.window.document.title.trim();
  const article = new Readability(dom.window.document).parse();
  if (!article?.content) {
    return err(
      ingestFailure(
        "We could not find readable text on this page. Copy the text and use Paste instead.",
        false,
      ),
    );
  }

  const body = new JSDOM(article.content).window.document.body;
  const blocks = [...body.querySelectorAll(BLOCKS)]
    .filter((el) => !el.querySelector(BLOCKS))
    .map((el) => normalizeWhitespace(el.textContent ?? "").replace(/\n+/g, " "))
    .filter((t) => t.length > 0);
  const text =
    blocks.length > 0 ? blocks.join("\n\n") : normalizeWhitespace(body.textContent ?? "");
  const segments = paragraphSegments(text);
  // Under ~50 characters is a menu or a cookie banner, not an article.
  if (text.length < 50) {
    return err(
      ingestFailure("This page has no readable text. Copy the text and use Paste instead.", false),
    );
  }

  const title = article.title?.trim() || pageTitle || new URL(url).hostname;
  return ok({ title, segments });
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Downloads a page (HTML only, up to 5 MB) and parses it. */
export async function parseWebpage(
  url: string,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<Result<ParsedSource, IngestFailure>> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      redirect: "follow",
      signal: signal ?? AbortSignal.timeout(30_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Thoth/0.1",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (e) {
    return err(
      ingestFailure(
        "We could not reach this page. Check the link and your connection, then try again.",
        true,
        e,
      ),
    );
  }

  if (!res.ok) {
    const transient = res.status === 429 || res.status >= 500;
    return err(
      ingestFailure(
        transient
          ? `The site answered with an error (${res.status}). Try again in a few minutes.`
          : `The site refused the request (${res.status}). Open the page in your browser, copy the text and use Paste instead.`,
        transient,
      ),
    );
  }

  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/pdf")) {
    return err(ingestFailure("This link is a PDF. Download it, then add it with Upload.", false));
  }
  if (type && !/html|xml/.test(type)) {
    return err(
      ingestFailure(
        "This link is not a web page. Add a page link, or upload the file instead.",
        false,
      ),
    );
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return err(
      ingestFailure("This page is over 5 MB. Copy the part you need and use Paste instead.", false),
    );
  }
  return parseHtml(new TextDecoder().decode(bytes), res.url || url);
}
