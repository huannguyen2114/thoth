import { describe, expect, it } from "vitest";
import { youtubeVideoId } from "./youtube-id";

describe("youtubeVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=ba-HMvDn_vU", "ba-HMvDn_vU"],
    ["https://youtube.com/watch?v=ba-HMvDn_vU&t=42s", "ba-HMvDn_vU"],
    ["https://m.youtube.com/watch?v=ba-HMvDn_vU", "ba-HMvDn_vU"],
    ["https://youtu.be/ba-HMvDn_vU?si=x", "ba-HMvDn_vU"],
    ["https://www.youtube.com/embed/ba-HMvDn_vU", "ba-HMvDn_vU"],
    ["https://www.youtube.com/shorts/ba-HMvDn_vU", "ba-HMvDn_vU"],
    ["https://www.youtube.com/live/ba-HMvDn_vU", "ba-HMvDn_vU"],
  ])("reads %s", (url, id) => {
    expect(youtubeVideoId(url)).toBe(id);
  });

  it.each([null, "", "not a url", "https://vimeo.com/123", "https://youtube.com/watch?v=short"])(
    "rejects %s",
    (url) => {
      expect(youtubeVideoId(url)).toBeNull();
    },
  );
});
