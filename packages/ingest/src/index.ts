import { readFile } from "node:fs/promises";
import {
  err,
  type IngestFailure,
  type IngestSource,
  ingestFailure,
  ok,
  type ParsedSource,
  type Result,
  type SourceParser,
} from "@thoth/core";
import { parsePdf } from "./pdf";
import { normalizeWhitespace, paragraphSegments, titleFromText } from "./text";
import { type FetchLike, parseWebpage } from "./webpage";
import { parseYoutube, type YoutubeDeps } from "./youtube";
import { libraryCueFetcher, oembedTitle, ytDlpCueFetcher } from "./youtube-sources";

export { parsePdf } from "./pdf";
export { normalizeWhitespace, paragraphSegments, titleFromText } from "./text";
export { parseHtml, parseWebpage } from "./webpage";
export { groupCues, parseYoutube } from "./youtube";

export interface SourceIngestorDeps {
  youtube?: YoutubeDeps;
  fetch?: FetchLike;
  readFile?: (path: string) => Promise<Uint8Array>;
}

/**
 * The `SourceParser` adapter: dispatches each source kind to its parser.
 * Constructed only by the composition root (apps/web/src/server/container.ts).
 */
export class SourceIngestor implements SourceParser {
  private readonly youtube: YoutubeDeps;
  private readonly fetchImpl: FetchLike;
  private readonly readFileImpl: (path: string) => Promise<Uint8Array>;

  constructor(deps: SourceIngestorDeps = {}) {
    this.youtube = deps.youtube ?? {
      cueFetchers: [libraryCueFetcher, ytDlpCueFetcher],
      fetchTitle: oembedTitle,
    };
    this.fetchImpl = deps.fetch ?? fetch;
    this.readFileImpl = deps.readFile ?? readFile;
  }

  async parse(
    source: IngestSource,
    signal?: AbortSignal,
  ): Promise<Result<ParsedSource, IngestFailure>> {
    switch (source.kind) {
      case "pdf": {
        let bytes: Uint8Array;
        try {
          bytes = await this.readFileImpl(source.filePath);
        } catch (e) {
          return err(
            ingestFailure("The uploaded file is missing. Upload the PDF again.", false, e),
          );
        }
        return parsePdf(bytes, source.fileName);
      }
      case "youtube":
        return parseYoutube(source.url, this.youtube, signal);
      case "webpage":
        return parseWebpage(source.url, this.fetchImpl, signal);
      case "text":
        return parseText(source.text);
    }
  }
}

/** Pasted text: paragraphs with offsets into the text exactly as pasted. */
export function parseText(text: string): Result<ParsedSource, IngestFailure> {
  const segments = paragraphSegments(text);
  if (segments.length === 0) {
    return err(ingestFailure("The pasted text is empty. Paste some text and try again.", false));
  }
  const title = titleFromText(normalizeWhitespace(text)) || "Pasted text";
  return ok({ title, segments });
}
export {
  parsePlaylistData,
  parseYtDlpPlaylist,
  readInitialData,
  YoutubePlaylistLister,
} from "./youtube-playlist";
