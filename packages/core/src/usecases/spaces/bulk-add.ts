import type { Content } from "../../domain/content";
import type { PlaylistLister } from "../../ports/ingest";
import type { SpaceRepository } from "../../ports/repositories";
import type { SpaceId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { type AddContentDeps, addContent } from "../ingest/add-content";
import { youtubeVideoId } from "../ingest/source-url";

/**
 * Bulk add (doc 22): a YouTube playlist becomes one ordinary YouTube ingest per video, in the
 * chosen space. Folders of PDFs need no use case of their own: the browser uploads each file
 * through the normal upload route, which calls `addContent`.
 */

/** Most videos one playlist import queues. A longer playlist imports its first ones. */
export const MAX_PLAYLIST_VIDEOS = 200;

const LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;

/** The playlist id of a YouTube URL (`list=` on a playlist or watch link), or null. */
export function youtubePlaylistId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  if (host !== "youtube.com" && host !== "youtu.be") return null;
  const id = url.searchParams.get("list");
  // "WL" (Watch later) and "LL" (liked) are private lists nobody else can read.
  return id && LIST_ID.test(id) ? id : null;
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

export interface PlaylistImport {
  title: string | null;
  added: Content[];
  /** Videos already in the library, skipped so a re-import adds only new ones. */
  skipped: number;
  /** Videos past MAX_PLAYLIST_VIDEOS that were not queued. */
  truncated: number;
}

export async function addPlaylist(
  deps: AddContentDeps & { playlists: PlaylistLister; spaces: SpaceRepository },
  input: { url: string; spaceId: SpaceId | null },
  signal?: AbortSignal,
): Promise<Result<PlaylistImport>> {
  const listId = youtubePlaylistId(input.url);
  if (!listId) {
    return err(appError("validation", "Paste a YouTube playlist link, one with list= in it."));
  }
  if (input.spaceId && !(await deps.spaces.get(input.spaceId))) {
    return err(appError("not_found", "This space no longer exists."));
  }
  const listing = await deps.playlists.list(listId, signal);
  if (!listing.ok) return err(appError("validation", listing.error.message));

  const unique = [...new Map(listing.value.videos.map((v) => [v.id, v])).values()];
  if (unique.length === 0) {
    return err(appError("validation", "This playlist has no videos we can add."));
  }
  const known = new Set(
    (await deps.contents.listRecent(5000)).flatMap((c) => {
      const id = c.kind === "youtube" && c.sourceUrl ? youtubeVideoId(c.sourceUrl) : null;
      return id ? [id] : [];
    }),
  );
  const fresh = unique.filter((v) => !known.has(v.id));
  const queued = fresh.slice(0, MAX_PLAYLIST_VIDEOS);
  const added: Content[] = [];
  for (const v of queued) {
    const r = await addContent(deps, { kind: "link", url: watchUrl(v.id), spaceId: input.spaceId });
    if (r.ok) added.push(r.value);
  }
  return ok({
    title: listing.value.title,
    added,
    skipped: unique.length - fresh.length,
    truncated: fresh.length - queued.length,
  });
}
