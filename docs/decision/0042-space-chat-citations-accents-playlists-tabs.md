# ADR-0042: Space chat citations, accent swatches, playlist listing, space tabs

- Status: Accepted
- Date: 2026-11-21
- Builds on: ADR-0009, ADR-0029, ADR-0038, ADR-0039

## Context

Lane 4 builds spaces v2 (doc 22) on the Step 0 contracts. Four choices were not fixed by them:

1. How the model cites across several sources, and how that becomes the stored `thoth:` links ADR-0039 asks for.
2. How to draw nine accent names (`accentColors`) when Hearth ships one brand hue and no category palette, and ADR-0009 forbids hex.
3. How to list a YouTube playlist without a new heavy dependency.
4. Whether the space page is a dock (like the content workspace) or tabs.

## Decision

1. **Sources are labelled S1..Sn in the prompt.** Each `<source id="Sn" title="…">` block holds that content's passages with their usual position tokens. The model cites `[S2 p.3]`, `[S1 03:21]`, `[S3 §2]` or `[S2]`. `linkSpaceCitations` (pure, in core) rewrites them into `[Title · p.3](thoth:c/<id>?at=p.3)` before the answer is saved; unknown sources are dropped. `ChatMessage.citations` stays empty for space answers, and the links are indexed as `chat_message` backlinks. The browser runs the same function on the streamed text, using the sources sent in the `start` event, so chips appear while the answer streams.
2. **Accent swatches are derived from Hearth's semantic tokens** with `color-mix` in `apps/web/src/features/spaces/accents.css`: gray = `ink-muted`, red = `danger`, orange = `accent`, yellow = `warning`, teal = `success`, blue = `info`, and green, purple and pink are mixes of two tokens. No hex anywhere, and both themes follow because every input is a theme token. Text on a tint stays `ink`; the accent itself is only a dot, an icon or a ring. When Hearth gains a category palette, only this file changes.
3. **`PlaylistLister` is a core port** (`ports/ingest.ts`), implemented by `YoutubePlaylistLister` in `@thoth/ingest`: it reads `ytInitialData` from the playlist page (both `playlistVideoRenderer` and `lockupViewModel` shapes), and asks `yt-dlp --flat-playlist -J` when the page fails or has a continuation (over ~100 videos) and yt-dlp is installed. `addPlaylist` queues one ordinary YouTube ingest per new video, skips videos already in the library and caps an import at 200.
4. **The space page uses tabs, not a dock.** A space has six views that are rarely needed side by side, and chat, notes and the board each want the full width. Tabs (`?tab=` in the URL) are simpler on a phone and let History, search and the dashboard link straight to a tab. A panel mounts on first visit and stays mounted while hidden, so a streaming answer survives a switch.

## Consequences

- The scripted e2e model recognises the space chat prompt by its first words (`SPACE_CHAT_PROMPT_START`).
- Lane 3's annotation colours can reuse `accents.css` (`data-accent="<name>"`, `.accent-dot`, `.accent-tint`).
- A YouTube page redesign can empty the page listing; yt-dlp then covers it when installed, and the parser tests pin both known shapes.
- A content can be dragged onto any space in the sidebar; dragging uses an app-specific MIME type, so text drags elsewhere are unaffected.
