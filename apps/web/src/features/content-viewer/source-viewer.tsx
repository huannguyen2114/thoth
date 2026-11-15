"use client";

import type { Content, Segment } from "@thoth/core";
import { PdfViewer } from "./pdf-viewer";
import { TextViewer } from "./text-viewer";
import { youtubeVideoId } from "./youtube-id";
import { YouTubePlayer } from "./youtube-player";

/** Picks the viewer for a content kind. Every viewer registers its jumps with ViewerProvider. */
export function SourceViewer({ content, segments }: { content: Content; segments: Segment[] }) {
  if (content.kind === "youtube") {
    const id = youtubeVideoId(content.sourceUrl);
    if (!id) {
      return (
        <div className="callout callout--warning max-w-none" role="alert">
          <div>
            <p className="callout__title">This video link is not a YouTube link.</p>
            <p className="callout__text">You can still use the transcript and chat below.</p>
          </div>
        </div>
      );
    }
    return <YouTubePlayer videoId={id} title={content.title} />;
  }
  if (content.kind === "pdf") {
    return content.filePath ? (
      <PdfViewer url={`/api/content/${encodeURIComponent(content.id)}/file`} />
    ) : (
      <TextViewer segments={segments} mode="pages" />
    );
  }
  return <TextViewer segments={segments} mode="paragraphs" />;
}
