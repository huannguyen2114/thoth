"use client";

import { useEffect, useRef, useState } from "react";
import { useViewer } from "./viewer-context";

/** The few parts of the YouTube IFrame Player API we use. */
interface YtPlayer {
  seekTo(sec: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
}
interface YtNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: () => void };
    },
  ) => YtPlayer;
}
declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YtNamespace> | null = null;

/** Loads https://www.youtube.com/iframe_api once per page. */
function loadYouTubeApi(): Promise<YtNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("YouTube player failed to load."));
    };
    document.head.append(script);
  });
  return apiPromise;
}

const POLL_MS = 500;

/**
 * YouTube video through the IFrame Player API. Registers `seek` with the viewer and reports
 * the playback time every half second so the transcript can follow along.
 */
export function YouTubePlayer({ videoId, title }: { videoId: string; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const { register, setPosition } = useViewer();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let player: YtPlayer | null = null;
    let timer: number | undefined;
    let cancelled = false;
    // Seeks requested before the player is ready are applied on ready.
    let pendingSeek: number | null = null;

    register({
      seek: (sec) => {
        if (!player) {
          pendingSeek = sec;
          return;
        }
        player.seekTo(sec, true);
        player.playVideo();
        setPosition({ type: "time", sec });
      },
    });

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !host.current) return;
        const mount = document.createElement("div");
        host.current.replaceChildren(mount);
        const p = new YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
          events: {
            onReady: () => {
              player = p;
              if (pendingSeek !== null) {
                p.seekTo(pendingSeek, true);
                p.playVideo();
                pendingSeek = null;
              }
              let last = -1;
              timer = window.setInterval(() => {
                const sec = Math.floor(p.getCurrentTime());
                if (sec !== last) {
                  last = sec;
                  setPosition({ type: "time", sec });
                }
              }, POLL_MS);
            },
          },
        });
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      register(null);
      player?.destroy();
    };
  }, [videoId, register, setPosition]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-300">
      <div ref={host} className="absolute inset-0" title={title} />
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center">
          <p className="type-body text-ink-muted">
            The video player did not load. Check your connection, then reload the page.
          </p>
        </div>
      )}
    </div>
  );
}
