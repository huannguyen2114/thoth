import type { NewSegment } from "../domain/content";
import type { AppError, Result } from "../shared/result";

/**
 * Source parsing port. Implemented by @thoth/ingest (PDF, YouTube, web page, text).
 * See docs/technical_design/03-ingestion.md.
 */
export type IngestSource =
  | { kind: "pdf"; filePath: string; fileName: string | null }
  | { kind: "youtube"; url: string }
  | { kind: "webpage"; url: string }
  | { kind: "text"; text: string };

export interface ParsedSource {
  title: string;
  segments: NewSegment[];
}

/**
 * A parse failure. `retryable` is true for transient faults (network, rate limit) that a
 * later attempt may fix, and false when retrying cannot help (no transcript, empty PDF).
 */
export interface IngestFailure extends AppError {
  code: "ingest_failed";
  retryable: boolean;
}

export interface SourceParser {
  parse(source: IngestSource, signal?: AbortSignal): Promise<Result<ParsedSource, IngestFailure>>;
}

export const ingestFailure = (
  message: string,
  retryable: boolean,
  cause?: unknown,
): IngestFailure =>
  cause === undefined
    ? { code: "ingest_failed", message, retryable }
    : { code: "ingest_failed", message, retryable, cause };

/** One video of a YouTube playlist (Phase 10 bulk add, doc 22). */
export interface PlaylistVideo {
  /** The 11-character video id. */
  id: string;
  title: string | null;
}

export interface PlaylistListing {
  title: string | null;
  videos: PlaylistVideo[];
}

/** Lists a YouTube playlist's videos. Implemented in @thoth/ingest; never downloads media. */
export interface PlaylistLister {
  list(playlistId: string, signal?: AbortSignal): Promise<Result<PlaylistListing, IngestFailure>>;
}
