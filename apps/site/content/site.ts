import { z } from "zod";

/**
 * Everything the landing page says, in one place (ADR-0044, doc 23).
 *
 * Keep it current: a user-visible change to Thoth updates this file, and
 * `apps/web/e2e/site-shots.ts` when the screen changed, in the same change.
 * `pnpm site:check` fails when a technical-design doc is not covered by a feature below
 * (or listed in `notUserFacing`), when a screenshot id has no shot, or when the platforms
 * drift from the desktop build.
 *
 * Voice: Hearth (warm, plain, sentence case, no exclamation marks). Say what it does.
 */

export const REPO_URL = "https://github.com/huannguyen2114/thoth";

/** Screenshot ids. Each one is produced by `site-shots.ts` as `<id>-light.png` and `<id>-dark.png`. */
export const shotIds = [
  "workspace",
  "chat",
  "notes",
  "pdf",
  "quiz",
  "progress",
  "space",
  "planner",
  "whiteboard",
  "settings",
] as const;
export type ShotId = (typeof shotIds)[number];

const featureSchema = z.object({
  id: z.string().regex(/^[a-z-]+$/),
  /** Small label above the title. */
  kicker: z.string(),
  title: z.string(),
  body: z.string(),
  points: z.array(z.string()).max(4),
  shot: z.enum(shotIds),
  /** Technical-design docs (by number) whose user-visible behaviour this feature presents. */
  docs: z.array(z.number().int().min(1)).min(1),
});

const platformSchema = z.object({
  id: z.enum(["mac-arm64", "mac-x64", "windows", "linux-appimage", "linux-deb"]),
  label: z.string(),
  /** Release asset name (ADR-0045). Links go to releases/latest/download/<asset>. */
  asset: z.string(),
  /** The desktop.yml matrix target that builds it. */
  target: z.string(),
});

const siteSchema = z.object({
  name: z.literal("Thoth"),
  tagline: z.string(),
  description: z.string(),
  features: z.array(featureSchema).min(1),
  /** Technical-design docs that describe internals, not something a visitor would see. */
  notUserFacing: z.array(z.number().int()),
  platforms: z.array(platformSchema).min(1),
  models: z.array(z.object({ name: z.string(), how: z.string(), good: z.string() })),
  privacy: z.array(z.object({ value: z.string(), label: z.string() })),
  shortcuts: z.array(z.object({ keys: z.array(z.string()), action: z.string() })),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
});
export type Site = z.infer<typeof siteSchema>;
export type Feature = Site["features"][number];
export type Platform = Site["platforms"][number];

export const site: Site = siteSchema.parse({
  name: "Thoth",
  tagline: "Learn anything from your own sources.",
  description:
    "Thoth turns your PDFs, lectures, videos and web pages into chats, notes, quizzes, flashcards and exams. It runs on your computer, with the AI model you choose.",

  features: [
    {
      id: "chat",
      kicker: "Ask your sources",
      title: "Answers that point to the page.",
      body: "Ask a question about a lecture or a 300-page PDF. Every answer cites where it came from, and a click on a citation jumps the video to that second or the PDF to that page.",
      points: [
        "Citations to pages, timestamps and paragraphs",
        "Chapters and a searchable transcript beside the source",
        "Search by meaning across everything, with ⌘K",
      ],
      shot: "chat",
      docs: [3, 7, 13, 16],
    },
    {
      id: "notes",
      kicker: "Notes that link back",
      title: "Your notes remember where every idea came from.",
      body: "Select a passage in a PDF, transcript or summary and send it to your notes. It arrives as a quote with a link chip that opens the source at that exact spot. Type [[ to link any page, timestamp or highlight.",
      points: [
        "Live-preview Markdown editor with autosave",
        "Summaries in three styles, and notes drafted by the model",
        "Backlinks show which notes quote a passage",
      ],
      shot: "notes",
      docs: [8, 12, 21],
    },
    {
      id: "pdf",
      kicker: "Mark up your PDFs",
      title: "Highlight, comment, draw.",
      body: "Highlight in five colours, add comments, and draw with a pen or Apple Pencil. Your marks are stored apart from the file, and you can download a copy with them written in, for Preview or Acrobat.",
      points: [
        "Pen, rectangles, ellipses and arrows",
        "Turn a highlight into a flashcard",
        "An annotations list that jumps to each mark",
      ],
      shot: "pdf",
      docs: [21],
    },
    {
      id: "practice",
      kicker: "Practice",
      title: "Quizzes that teach, cards that come back on time.",
      body: "Generate quizzes by topic with five question types. Free answers are graded with feedback. Flashcards are scheduled with FSRS, so each card returns just before you would forget it.",
      points: [
        "Multiple choice, multi-select, true or false, fill in the blank, free response",
        "A review queue across every deck",
        "Export a deck to Anki",
      ],
      shot: "quiz",
      docs: [9],
    },
    {
      id: "exams",
      kicker: "Exams and progress",
      title: "See what you know, and what you don't yet.",
      body: "Build a timed exam across a space. Results break down by topic and link to the passages behind each answer. Weak topics turn into a practice quiz in one click.",
      points: [
        "Timed exams, with answers hidden until you submit",
        "A study heatmap and history",
        "Practice weak spots",
      ],
      shot: "progress",
      docs: [10, 13],
    },
    {
      id: "spaces",
      kicker: "Spaces",
      title: "One place for each course.",
      body: "Group a course's sources in a space. Chat across all of them, keep space notes and a board, and see what is due today on the space dashboard.",
      points: [
        "Chat across every source, with chips that open the right one",
        "Tags, colours, and bulk add of PDFs, folders or a YouTube playlist",
        "A dashboard with cards due, weak topics and the next exam",
      ],
      shot: "space",
      docs: [22],
    },
    {
      id: "planner",
      kicker: "Study planner",
      title: "A plan that fits your days.",
      body: "Pick an exam date and the days you study. Thoth spreads the work across them, keeps a rest day, and re-plans when you fall behind.",
      points: ["Today's tasks on the home page", "Adapts to your progress"],
      shot: "planner",
      docs: [17],
    },
    {
      id: "whiteboard",
      kicker: "Whiteboard",
      title: "Think on a canvas.",
      body: "Ask the model to lay out an explanation, or make a mind map of a source. Edit it like any board. Every element can link back to the page or moment it came from.",
      points: ["Mind maps from any source", "Stickies, shapes, arrows and source badges"],
      shot: "whiteboard",
      docs: [18],
    },
    {
      id: "everywhere",
      kicker: "On your desk and in your pocket",
      title: "A desktop app, with your phone as a second screen.",
      body: "Install Thoth on macOS, Windows or Linux. It feels like a native app: a sidebar, a command palette, panels you can dock. Open it on your phone over Wi-Fi, behind a passcode.",
      points: [
        "Keyboard first, with ⌘K for everything",
        "Light and dark themes",
        "Phone access only when you turn it on",
      ],
      shot: "workspace",
      docs: [11, 14, 19],
    },
    {
      id: "models",
      kicker: "Your model",
      title: "Bring the model you already pay for, or none at all.",
      body: "Use your Claude subscription, an Anthropic API key, or any OpenAI-compatible provider. Pick a different model per task, like a local model for flashcards and Claude for chat. Keys stay in your system keychain.",
      points: ["Claude, OpenAI, OpenRouter, Ollama, LM Studio", "A provider and model per task"],
      shot: "settings",
      docs: [2, 20],
    },
  ],

  notUserFacing: [1, 4, 5, 6, 15, 23],

  platforms: [
    {
      id: "mac-arm64",
      label: "macOS (Apple Silicon)",
      asset: "Thoth-macOS-arm64.dmg",
      target: "aarch64-apple-darwin",
    },
    {
      id: "mac-x64",
      label: "macOS (Intel)",
      asset: "Thoth-macOS-x64.dmg",
      target: "x86_64-apple-darwin",
    },
    {
      id: "windows",
      label: "Windows",
      asset: "Thoth-Windows-x64.msi",
      target: "x86_64-pc-windows-msvc",
    },
    {
      id: "linux-appimage",
      label: "Linux (AppImage)",
      asset: "Thoth-Linux-x86_64.AppImage",
      target: "x86_64-unknown-linux-gnu",
    },
    {
      id: "linux-deb",
      label: "Linux (.deb)",
      asset: "Thoth-Linux-amd64.deb",
      target: "x86_64-unknown-linux-gnu",
    },
  ],

  models: [
    {
      name: "Claude subscription",
      how: "Signs in through Claude Code on your computer",
      good: "Everything, with no API bill",
    },
    {
      name: "Anthropic API key",
      how: "A key saved in your system keychain",
      good: "Prompt caching on long sources",
    },
    {
      name: "Ollama or LM Studio",
      how: "A model running on your own machine",
      good: "Free and offline; lighter tasks like flashcards",
    },
    {
      name: "OpenRouter or OpenAI",
      how: "Any OpenAI-compatible base URL and key",
      good: "Trying other hosted models",
    },
  ],

  privacy: [
    { value: "0", label: "accounts" },
    { value: "0", label: "telemetry" },
    { value: "0", label: "servers we run" },
    { value: "1", label: "folder on your computer" },
  ],

  shortcuts: [
    { keys: ["⌘", "K"], action: "Search everything and run any command" },
    { keys: ["⌘", "\\"], action: "Show or hide the sidebar" },
    { keys: ["⌘", ","], action: "Open settings" },
    { keys: ["[", "["], action: "Link a page, timestamp or highlight in your notes" },
    { keys: ["/"], action: "Insert a heading, list, quote or callout in your notes" },
    { keys: ["⌘", "Z"], action: "Undo, including a model's draft" },
  ],

  faq: [
    {
      q: "What does it cost?",
      a: "Thoth is free and open source under the AGPL. You pay only for the model you choose, and a local model costs nothing.",
    },
    {
      q: "How is it different from hosted study apps?",
      a: "Your sources, notes and progress stay on your computer, there are no upload limits, and you choose the model. It is one person's app, not a service.",
    },
    {
      q: "Does it work offline?",
      a: "Thoth runs on your computer, so reading, notes, reviews and search need no internet. Generating needs your model: a local one works offline, a hosted one needs internet.",
    },
    {
      q: "Can I use it on my phone?",
      a: "Yes, over your Wi-Fi or Tailscale. Turn on Serve on LAN in the desktop app and set a passcode; every other device must enter it.",
    },
    {
      q: "Why does my computer warn me when I first open it?",
      a: "The installers are not code-signed yet. On macOS, right-click the app and choose Open once. On Windows, choose More info, then Run anyway.",
    },
    {
      q: "Where is my data?",
      a: "In one folder: the app's data folder on your computer. Back it up or move it like any other folder.",
    },
  ],
});

export const downloadUrl = (p: Platform): string =>
  `${REPO_URL}/releases/latest/download/${p.asset}`;
