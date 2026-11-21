import { describe, expect, it } from "vitest";
import type { Job, JobKind } from "../../domain/job";
import { ingestFailure, type PlaylistLister } from "../../ports/ingest";
import type { JobRepository } from "../../ports/repositories";
import { type JobId, newId, type SpaceId } from "../../shared/id";
import { err, ok } from "../../shared/result";
import { addPlaylist, MAX_PLAYLIST_VIDEOS, youtubePlaylistId } from "./bulk-add";
import { world } from "./fakes.test-support";

class Jobs implements JobRepository {
  rows: Job[] = [];
  async enqueue(kind: JobKind, payload: Record<string, unknown>) {
    const j = { id: newId<JobId>(), kind, payload, status: "queued" } as unknown as Job;
    this.rows.push(j);
    return j;
  }
  async claimNext() {
    return null;
  }
  async complete() {}
  async fail() {}
  async get() {
    return null;
  }
  async requeueRunning() {
    return 0;
  }
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `vid${String(i).padStart(8, "0")}`);
const lister = (videos: string[]): PlaylistLister => ({
  list: async () => ok({ title: "Course", videos: videos.map((id) => ({ id, title: null })) }),
});

describe("youtubePlaylistId", () => {
  it("reads list= from playlist and watch links", () => {
    expect(youtubePlaylistId("https://www.youtube.com/playlist?list=PL1234567890ab")).toBe(
      "PL1234567890ab",
    );
    expect(youtubePlaylistId("https://youtube.com/watch?v=abcdefghijk&list=PLabcdefghij")).toBe(
      "PLabcdefghij",
    );
    expect(youtubePlaylistId("https://www.youtube.com/watch?v=abcdefghijk")).toBeNull();
    expect(youtubePlaylistId("https://example.com/?list=PL1234567890ab")).toBeNull();
    expect(youtubePlaylistId("not a url")).toBeNull();
  });
});

describe("addPlaylist", () => {
  it("queues one YouTube ingest per new video, in the chosen space", async () => {
    const w = world();
    const jobs = new Jobs();
    const space = await w.spaces.create({ name: "S", description: null, color: null, icon: null });
    const [a, b, c] = ids(3) as [string, string, string];
    w.contents.add("Old", { kind: "youtube", url: `https://youtu.be/${b}` });
    const r = await addPlaylist(
      { ...w, jobs, playlists: lister([a, b, c, a]) },
      { url: "https://www.youtube.com/playlist?list=PL1234567890ab", spaceId: space.id },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.added.map((x) => x.sourceUrl)).toEqual([
      `https://www.youtube.com/watch?v=${a}`,
      `https://www.youtube.com/watch?v=${c}`,
    ]);
    expect(r.value.added.every((x) => x.spaceId === space.id && x.kind === "youtube")).toBe(true);
    expect(r.value).toMatchObject({ title: "Course", skipped: 1, truncated: 0 });
    expect(jobs.rows).toHaveLength(2);
  });

  it("caps a huge playlist", async () => {
    const w = world();
    const r = await addPlaylist(
      { ...w, jobs: new Jobs(), playlists: lister(ids(MAX_PLAYLIST_VIDEOS + 5)) },
      { url: "https://www.youtube.com/playlist?list=PL1234567890ab", spaceId: null },
    );
    expect(r.ok && r.value.added.length).toBe(MAX_PLAYLIST_VIDEOS);
    expect(r.ok && r.value.truncated).toBe(5);
  });

  it("explains a bad link, a missing space and a listing failure", async () => {
    const w = world();
    const deps = { ...w, jobs: new Jobs(), playlists: lister(ids(1)) };
    const bad = await addPlaylist(deps, { url: "https://youtu.be/abcdefghijk", spaceId: null });
    expect(!bad.ok && bad.error.message).toMatch(/playlist link/);
    const gone = await addPlaylist(deps, {
      url: "https://www.youtube.com/playlist?list=PL1234567890ab",
      spaceId: "x" as SpaceId,
    });
    expect(!gone.ok && gone.error.code).toBe("not_found");
    const failing: PlaylistLister = {
      list: async () => err(ingestFailure("This playlist is private.", false)),
    };
    const r = await addPlaylist(
      { ...deps, playlists: failing },
      { url: "https://www.youtube.com/playlist?list=PL1234567890ab", spaceId: null },
    );
    expect(!r.ok && r.error.message).toBe("This playlist is private.");
  });
});
