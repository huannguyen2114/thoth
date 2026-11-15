# Thoth roadmap

> **Status:** Phase 0 done. Phase 1 built (2026-11-15); a live reply is waiting on a Claude Code sign-in or an API key. Next: Phase 2.
> Where this plan and an ADR disagree, **the ADR wins** (`docs/decision/`). The architecture below is the original sketch. The current design is `docs/technical_design/`.

## Context

You want your own version of YouLearn (youlearn.ai, YC X25, about 2M users). It turns PDFs, YouTube videos, and web pages into chats, summaries, notes, quizzes, flashcards, and exams.

The difference: it uses **your own Anthropic API key** or **your Claude subscription**, through headless Claude Code / the Claude Agent SDK. That means no per-plan quotas. YouLearn's free tier, for example, allows 2 uploads.

Decisions you made:

- **Single user, runs locally on your Mac.**
- **Installable PWA.** It should also work on your phone over LAN or Tailscale.
- **MVP:** chat, summary, and notes, plus quiz, flashcards, and exam.
- **Later:** podcast, voice, video, whiteboard, and lesson plan.

The repo lives at `SysDes/thoth/` (GitHub: private repo `thoth`).

---

## Part A: YouLearn findings (saved to `docs/research/youlearn.md` in Phase 0)

### How it works (seen in the logged-in app at app.youlearn.ai)

**Home**

- "What should we learn, {name}?" prompt box with four buttons: **Upload | Link | Paste | Record**.
- Below it: a Spaces grid ("New Space" plus your spaces) and Recents cards with thumbnails.

**Left sidebar**

- Add content, Search, History, Recents, Spaces, My Library.
- Feedback, Quick Guide, Mobile App, Chrome Extension, Discord.
- A plan badge ("Free Plan").

**Content page** (`/content/{id}`) has three columns:

- **Left:** the sidebar.
- **Middle:** the source viewer (YouTube embed or PDF). Under it:
  - a **Chapters** tab: AI-generated sections, each with a timestamp, a title, and a paragraph summary;
  - a **Transcripts** tab;
  - an "Auto Scroll" toggle that follows the video.
- **Right:** the "Learn" panel. It has browser-like tabs (a "Learn Tab" plus a tab for each opened item, a "+" new tab button, and a Focus/fullscreen button):
  - a **Generate** grid of 8 tools, each with a settings (⚙) button: Podcast, Video, Summary, Quiz, Flashcards, Notes, Whiteboard (new), Lesson Plan;
  - a **My Sets** list of previously generated items, with dates;
  - a **chat box** at the bottom: "Ask anything", a model picker, Add Context, Attach File, Dictate, and Voice Mode.

**Top bar**

- Usage counter (the free plan showed 0/2, and New Exam moved it to 1/2), Upgrade, **New Exam**, Share, and a ⋮ menu.

### Generator settings (taken from the settings dialogs)

| Tool        | Options                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary     | Templates: Detailed / Cheat Sheet (concise bullets) / Short. Add a custom prompt. Language. **Summary range** (start–end timestamps or pages, several ranges allowed)                                   |
| Quiz        | Question types: Multiple Choice, Multi Select, Free Response, True/False, Fill in the blank. Difficulty: Easy / Medium / Hard. Number of questions. Topics (pick from chapters). Focus prompt. Language |
| Flashcards  | Number of cards. Topics. Focus prompt. Language                                                                                                                                                         |
| Podcast     | Voice 1 / Voice 2 (named TTS voices). Length: Short / Default / Detailed. Topics. Language                                                                                                              |
| Video       | Length: Short / Default / Detailed (2×). Key concepts. Language                                                                                                                                         |
| Lesson Plan | Template: Default (grouped by topic) or Detailed (per concept). Choose which tools to include: Summary, Podcast, Video, Quiz, Flashcards. It builds a sequenced plan (the counter showed 0/16 steps)    |
| Notes       | A notes document you edit, attached to the content                                                                                                                                                      |

### Behaviour

- **Quizzes are split by topic.** Each set is named, for example "Quiz 1: Effective Habit Formation Strategies". The completion screen offers Restart, Generate More, and "Next: {next topic quiz}".
- **New Exam** creates an exam inside a Space across all the content in that Space. It is timed and shows an answer breakdown, progress, and weak spots. In practice, clicking it created an "Untitled Space".
- **Chat model picker:** Auto, Gemini 3, Sonnet 5 (Pro), GPT-6 (Pro).
- **Add Context menu:** Recents (other content), Context, "Learn+", Built-in **Search** (web), **Study Mode**, Study tools (13), Chat instructions (custom system prompt).
- **Chat answers** cite page, paragraph, or timestamp references.
- **Inputs:** PDF, YouTube, slides/PPT, audio and video recordings, website URLs, pasted text, images. There is also a live **Record** option for lectures.
- **Other surfaces:** a Chrome extension (imports from Canvas or D2L, YouTube, websites), iOS and Android apps, and Share links.
- **Pricing:**

  | Plan  | Price              | Limits                                                       |
  | ----- | ------------------ | ------------------------------------------------------------ |
  | Free  | $0                 | Tight limits (a 2–3 upload counter, limited chats and exams) |
  | Pro   | about $20/mo       | Unlimited, plus premium models                               |
  | Max   | about $60–75/mo    | Unlimited podcasts and read-aloud                            |
  | Teams | about $15 per seat | Not detailed                                                 |

- **Their stack:** Next.js/React, FastAPI/Python, React Native (from a job posting).
- **Closest open-source reference:** lfnovo/open-notebook. It has no quizzes or flashcards.
- **What users complain about:** the free tier runs out fast, quiz questions are shallow, there is no spaced-repetition clarity, and there are no mind maps.

---

## Part B: Architecture

- **Next.js 16 (App Router) + TypeScript** (ADR-0011), made into a PWA:
  - built-in manifest plus a hand-written service worker (ADR-0007): installable, with an offline shell; cached flashcard review in Phase 6;
  - Tailwind + shadcn/ui.
- **Database:** SQLite through Drizzle ORM (libSQL, ADR-0006), with **FTS5** for search.
  - Files go in `./data/uploads`.
  - A single local user, so there is no auth. An optional passcode env var protects LAN/phone access.
- **LLM provider layer:** `lib/llm/`, with one interface: `generateText`, `streamChat`, `generateObject<T>(zodSchema)`.
  1. `AnthropicApiProvider`: uses `@anthropic-ai/sdk` with your key. Model choice: Opus 5.5, Sonnet 5.5, Haiku 5.5.
     - Prompt caching on the source text.
     - Structured output through tool-use with a JSON schema.
  2. `ClaudeSubscriptionProvider`: uses `@anthropic-ai/claude-agent-sdk` `query()`, the headless Claude Code you are logged in to.
     - All tools disabled, a custom system prompt, `maxTurns: 1`, and streaming of partial messages.
     - JSON output is validated with zod and retried once on failure.
  - A Settings page picks the provider and model per task. For example, Haiku for chapters and Sonnet for chat. The key is stored in `.env.local` or the settings table, and only on the server.
- **Retrieval:** no vector database at first.
  - If a source is under about 150k tokens, the full text goes into the prompt, and prompt caching makes repeat calls cheap.
  - If it is larger, or the request spans many contents (an exam across a Space), use SQLite FTS5 BM25 over chunks to pick the top-k chunks.
  - Optional later: local embeddings with `@huggingface/transformers` + `sqlite-vec`.
- **Ingestion** (`lib/ingest/`). Every source becomes `segments[]`, each with `{text, locator}`, where the locator is a page number or a start/end timestamp. Citations and the "summary range" depend on this.
  - **PDF:** `pdfjs-dist`, text for each page. The viewer is `react-pdf` and jumps to the cited page.
  - **YouTube:** transcript from `youtube-transcript` with timestamps. If that fails, fall back to `yt-dlp` subtitles. The viewer is the YouTube iframe API, with seek-on-click and auto-scroll.
  - **URL:** `@mozilla/readability` + `jsdom`.
  - **Paste:** plain text.
  - **Later:** audio and recordings through local `whisper.cpp`, and PPTX.
- **Background jobs:** a simple in-process queue stored in a `jobs` table. Status is pushed to the UI over SSE. There is no Redis.

### Data model (`db/schema.ts`)

- **Content:**
  - `spaces`
  - `contents` (type, title, source_url, file_path, status, space_id)
  - `segments` (content_id, idx, text, page, t_start, t_end)
  - `chapters` (content_id, idx, title, summary, locator)
  - `chunks_fts` (FTS5)
- **Chat:** `chats`, `messages` (role, text, citations JSON)
- **Generated items:** `sets` (content_id or space_id, kind = summary|notes|quiz|flashcards|exam, title, options JSON, created_at)
- **Quiz:** `quiz_questions` (set_id, type, prompt, choices JSON, answer JSON, explanation, topic, citation), `quiz_attempts`
- **Flashcards:** `flashcards` (set_id, front, back, citation, plus FSRS fields), `reviews`
- **Exams:** `exams` (space_id, duration, score, breakdown JSON)
- **Notes:** `notes` (content_id, markdown)
- **Settings:** `settings`

---

## Part C: Phases

Each phase ends with something that runs. After each phase I check it in the browser and we confirm before moving on.

### Phase 0: Scaffold (about half a day) — DONE 2026-11-15

- `create-next-app` with TS and Tailwind, plus shadcn, Drizzle with SQLite, and the Serwist PWA setup (manifest and icons).
- Write `docs/research/youlearn.md` from Part A.
- Add a `CLAUDE.md` with the dev commands.
- Run `git init`.
- **Done when:** `npm run dev` shows the home page and it can be installed as a PWA.

### Phase 1: LLM provider layer + Settings (about 1 day) — BUILT 2026-11-15

- Files: `lib/llm/types.ts`, `anthropic-api.ts`, `claude-subscription.ts`, `index.ts` (a factory driven by settings).
- A Settings page: provider radio buttons, API key, model per task, and a "Test connection" button.
- A `/api/llm/test` route.
- **Done when:** a test prompt streams back through **both** providers. The subscription provider uses your logged-in `claude`.

### Phase 2: Ingestion + library (about 2 days)

- The home prompt box with Upload (PDF), Link (YouTube or URL), and Paste. Spaces CRUD. Recents. A sidebar matching YouLearn's layout.
- An ingestion pipeline that turns each source into segments, then FTS chunks, and then **LLM chapter generation**: timestamped or page-ranged sections with a title and summary.
- **Done when:** adding a YouTube link and a PDF shows each one in Recents with status processing → ready.

### Phase 3: Content page + chat with citations (about 2–3 days)

- A three-column layout:
  - the viewer (YouTube or PDF) with Chapters and Transcript tabs and auto-scroll;
  - the right-hand Learn panel with closable tabs;
  - the chat box.
- Streaming chat over SSE. The prompt makes the model cite as `[p.12]` or `[03:21]`, and the UI turns these into chips that seek the video or jump the PDF.
- Chat history for each content. Custom chat instructions. An "Add context" option to pull in other contents.
- **Done when:** you can ask a question about a lecture and click a citation to jump to that timestamp.

### Phase 4: Summary + Notes (about 1–2 days)

- A Summary dialog with:
  - templates (Detailed, Cheat Sheet, Short);
  - a custom prompt;
  - language;
  - **range pickers**, as time or page ranges.
- Summaries render as markdown and are saved to My Sets.
- Notes: a Tiptap or markdown editor for each content. It can auto-generate notes and has an "Add to notes" button on chat messages.
- **Done when:** both appear in My Sets and reopen as tabs.

### Phase 5: Quiz (about 2–3 days)

- Quiz dialog options:
  - the 5 question types;
  - difficulty;
  - number of questions;
  - topic picker from chapters;
  - a focus prompt;
  - language.
- Generation uses `generateObject` with a zod schema, **one set per topic** ("Quiz 1: {topic}").
- The player:
  - one question at a time, with instant feedback, an explanation, and a citation;
  - **free-response answers graded by the LLM**;
  - a completion screen with Restart, Generate More, and Next topic.
- Attempts are stored, and weak topics are tracked.
- **Done when:** a 10-question mixed quiz is generated, played, and scored.

### Phase 6: Flashcards with spaced repetition (about 2 days)

- Flashcard dialog: count, topics, focus, language.
- Cards with front, back, and a citation. They can be edited and deleted.
- Review mode: flip, then rate Again, Hard, Good, or Easy, scheduled with **`ts-fsrs`**. A "Due today" view across all decks.
- Reviews work offline through the PWA cache, and the results sync when you are back online.
- **Done when:** cards come due on the right days.

### Phase 7: Exams + progress (about 2 days)

- "New Exam" inside a Space:
  - pick contents, duration, question count, and types;
  - FTS retrieval across all contents in the Space;
  - a timed exam UI;
  - a results breakdown for each topic, with links to the source spots.
- A progress dashboard: weak topics from quiz, exam, and flashcard data. A "Practice weak spots" button generates a targeted quiz.
- **Done when:** a Space exam runs end to end and the dashboard updates.

### Phase 8: Polish + phone (about 1–2 days)

- Global search (FTS), History, Share/export (markdown or Anki CSV), dark mode, a mobile layout (the Learn panel becomes a bottom sheet), and LAN or Tailscale access with a passcode.

### Later phases (after the MVP)

- **9:** Podcast. A two-host script from the LLM, then TTS (OpenAI TTS, ElevenLabs, or local Kokoro), then merged audio with ffmpeg. Then Voice tutor mode and Dictate (Web Speech API or whisper).
- **10:** Audio and video uploads, plus live Record. Transcription with whisper.cpp.
- **11:** Lesson Plan, an ordered sequence of generated tools for each topic. Then Whiteboard, an Excalidraw canvas the AI can draw on. Then mind maps.
- **12:** Web search in chat, and a Chrome extension "Send to Thoth".

---

## Verification

- **Each phase:** run `npm run dev`, open it in the built-in browser, and walk through that phase's "Done when". Run `npm run typecheck` and `npm run lint`.
- **Unit tests (Vitest):**
  - the ingestion parsers (PDF page locators, YouTube timestamps);
  - citation parsing;
  - quiz and flashcard zod schemas, including retry on bad JSON;
  - FSRS scheduling.
- **Provider parity test:** the same quiz request goes through the API provider and the subscription provider, and both must pass schema validation.
- **PWA:** Lighthouse installability check. Flashcard review must work offline.

## Risks

- **YouTube transcript scraping can break.** Fallback: `yt-dlp`.
- **The Claude Agent SDK is slower to start** (process startup) and only works while you are logged in on that Mac. That is fine for single-user local use, but it is not allowed for a hosted, multi-user service.
- **Big PDFs can exceed the context window.** FTS chunk retrieval handles this.
