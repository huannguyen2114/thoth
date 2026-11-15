/**
 * Pure URL helpers shared by the composer (to label a link) and the YouTube parser.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extracts the 11-character video ID from any common YouTube URL shape, or null. */
export function youtubeVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") id = url.searchParams.get("v");
    else if (first && ["embed", "shorts", "live", "v"].includes(first)) id = second ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

/** "youtube" for a video link, "webpage" for any other http(s) URL, null when not a URL. */
export function detectLinkKind(input: string): "youtube" | "webpage" | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return youtubeVideoId(input) ? "youtube" : "webpage";
}
