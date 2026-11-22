/**
 * Copy and scripted content for the landing page's interactive demos (Phase 12, doc 23).
 * The demos are recreations that run in the browser: no server, no model. Keep the claims true
 * to the real app (apps/site/content/site.ts and /features describe it in full).
 */

export type Cite = { cite: string; at: number };
export type AnswerPart = string | Cite;

export interface DemoSample {
  id: "lecture" | "pdf";
  tab: string;
  title: string;
  kind: "video" | "pdf";
  /** Seconds for a video, pages for a PDF. */
  length: number;
  chapters: { at: number; title: string }[];
  questions: { q: string; answer: AnswerPart[] }[];
}

export const landing = {
  rotatingWords: ["lecture", "PDF", "video", "web page", "textbook"],
  headline: { before: "Turn any", after: "into something you remember." },
  sub: "Thoth reads your sources with you: it answers with citations, writes notes and quizzes, and schedules your flashcards. On your computer, with the model you choose.",
  stickers: ["No account", "Works offline", "Your own model", "Open source"],

  samples: [
    {
      id: "lecture",
      tab: "Lecture video",
      title: "Thermodynamics, lecture 3",
      kind: "video",
      length: 1800,
      chapters: [
        { at: 0, title: "Why heat flows downhill" },
        { at: 201, title: "The second law" },
        { at: 612, title: "Engines and efficiency" },
        { at: 1080, title: "Entropy as counting" },
      ],
      questions: [
        {
          q: "Why does entropy always grow?",
          answer: [
            "Because there are far more disordered arrangements than ordered ones, so a system left alone drifts toward them ",
            { cite: "03:21", at: 201 },
            ". The lecture calls it counting: entropy measures how many microstates fit what you see ",
            { cite: "18:00", at: 1080 },
            ".",
          ],
        },
        {
          q: "Can an engine be 100% efficient?",
          answer: [
            "No. Some heat must always flow to the cold side, so only part of it becomes work ",
            { cite: "10:12", at: 612 },
            ".",
          ],
        },
        {
          q: "Summarise this lecture in one line",
          answer: [
            "Heat flows from hot to cold ",
            { cite: "00:00", at: 0 },
            ", entropy never decreases ",
            { cite: "03:21", at: 201 },
            ", and that caps every engine ",
            { cite: "10:12", at: 612 },
            ".",
          ],
        },
      ],
    },
    {
      id: "pdf",
      tab: "PDF chapter",
      title: "Cell biology, chapter 4",
      kind: "pdf",
      length: 6,
      chapters: [
        { at: 1, title: "The cell membrane" },
        { at: 2, title: "Mitochondria" },
        { at: 4, title: "ATP synthase" },
        { at: 6, title: "Summary" },
      ],
      questions: [
        {
          q: "What does ATP synthase do?",
          answer: [
            "It is a tiny turbine: protons flow through it and turn it, and each turn makes ATP ",
            { cite: "p.4", at: 4 },
            ".",
          ],
        },
        {
          q: "Why do mitochondria have folds?",
          answer: [
            "The folds, called cristae, add surface for the proteins that make energy ",
            { cite: "p.2", at: 2 },
            ".",
          ],
        },
        {
          q: "What should I remember for the exam?",
          answer: [
            "The membrane controls what enters ",
            { cite: "p.1", at: 1 },
            ", mitochondria make energy ",
            { cite: "p.2", at: 2 },
            ", and ATP synthase is how ",
            { cite: "p.4", at: 4 },
            ".",
          ],
        },
      ],
    },
  ] as DemoSample[],

  sources: [
    { id: "pdf", label: "PDF" },
    { id: "youtube", label: "YouTube" },
    { id: "web", label: "Web page" },
  ],

  outputs: [
    {
      id: "notes",
      title: "Notes",
      tone: "tone-peach",
      blurb: "A tidy draft with links back to every page.",
      preview: [
        "# The second law",
        "Entropy never decreases in an isolated system. [03:21]",
        "- Heat flows hot → cold",
        "- No engine is 100% efficient [10:12]",
      ],
    },
    {
      id: "quiz",
      title: "Quiz",
      tone: "tone-sage",
      blurb: "Questions by topic, graded with feedback.",
      preview: [
        "Q1. Which way does heat flow on its own?",
        "(●) Hot to cold",
        "( ) Cold to hot",
        "✓ Correct. That's the second law [03:21]",
      ],
    },
    {
      id: "cards",
      title: "Flashcards",
      tone: "tone-sky",
      blurb: "Spaced repetition that comes back on time.",
      preview: [
        "Front: What does entropy measure?",
        "Back: How many microstates fit the state you see.",
        "Next review: in 3 days",
      ],
    },
    {
      id: "map",
      title: "Mind map",
      tone: "tone-lilac",
      blurb: "The whole source on one board.",
      preview: ["Thermodynamics", "├─ Heat flow", "├─ Second law", "└─ Engines"],
    },
    {
      id: "exam",
      title: "Exam",
      tone: "tone-butter",
      blurb: "Timed, across your whole course.",
      preview: [
        "Physics 101 · 20 questions · 30 min",
        "Score 84%",
        "Weak spot: Engines and efficiency",
      ],
    },
  ],

  story: [
    {
      title: "Add a lecture.",
      body: "Paste a link, drop a PDF, or paste text. Thoth reads it on your computer.",
    },
    {
      title: "It finds the chapters.",
      body: "Sections with titles and summaries, each a click away in the source.",
    },
    { title: "Ask anything.", body: "Every answer points to the second or the page it came from." },
    {
      title: "Test yourself.",
      body: "Quizzes by topic, graded with feedback, that show you what to review.",
    },
    {
      title: "See the whole picture.",
      body: "A mind map of the source, every node linked back to it.",
    },
  ],

  flashcard: {
    front: "What does the second law of thermodynamics say?",
    back: "The entropy of an isolated system never decreases.",
    next: { Again: "in 1 minute", Hard: "in 1 day", Good: "in 3 days", Easy: "in 8 days" },
  },

  quiz: {
    q: "Heat flows on its own from…",
    choices: ["a cold body to a hot one", "a hot body to a cold one", "either way, at random"],
    correct: 1,
  },

  models: [
    { task: "Chat", options: ["Claude", "Local"] },
    { task: "Flashcards", options: ["Claude", "Local"] },
    { task: "Quizzes", options: ["Claude", "Local"] },
  ],
};
