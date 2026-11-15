import {
  err,
  type IngestFailure,
  ingestFailure,
  type NewSegment,
  ok,
  type ParsedSource,
  type Result,
} from "@thoth/core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { normalizeWhitespace, titleFromText } from "./text";

/**
 * Extracts text per page with pdfjs-dist: one segment per page, `{ type: "page" }` locator.
 * Pages with no text (scans, images) are skipped but keep their real page numbers.
 */
export async function parsePdf(
  data: Uint8Array,
  fileName: string | null = null,
): Promise<Result<ParsedSource, IngestFailure>> {
  // pdfjs detaches the buffer it is given and rejects Node Buffers (what fs.readFile returns),
  // so hand it a plain Uint8Array copy.
  const task = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    verbosity: 0,
  });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy().catch(() => undefined);
    const locked = e instanceof Error && e.name === "PasswordException";
    return err(
      ingestFailure(
        locked
          ? "This PDF is password-protected. Remove the password, then upload it again."
          : "We could not read this PDF. It may be damaged. Export it again, then upload the new file.",
        false,
        e,
      ),
    );
  }

  try {
    const segments: NewSegment[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      const raw = content.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
        .join("");
      const text = normalizeWhitespace(raw);
      if (text) segments.push({ idx: segments.length, text, locator: { type: "page", page } });
    }
    if (segments.length === 0) {
      return err(
        ingestFailure(
          "This PDF has no selectable text, so it is probably a scan. Run OCR on it, then upload it again.",
          false,
        ),
      );
    }

    const meta = await doc.getMetadata().catch(() => null);
    const metaTitle = (meta?.info as { Title?: unknown } | undefined)?.Title;
    const title =
      (typeof metaTitle === "string" && metaTitle.trim()) ||
      fileName?.replace(/\.pdf$/i, "").trim() ||
      titleFromText(segments[0]?.text ?? "") ||
      "Untitled PDF";
    return ok({ title, segments });
  } finally {
    await task.destroy();
  }
}
