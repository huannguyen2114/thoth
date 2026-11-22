/**
 * Copy and scripted content for the landing page's interactive demos (Phase 12, doc 23).
 * The demos are recreations that run in the browser: no server, no model. Keep the claims true
 * to the real app (content/site.ts and /features describe it in full).
 *
 * The example sources are a distributed-systems course: Martin Kleppmann's book "Designing
 * Data-Intensive Applications" and his Distributed Systems lectures. The answers are our own
 * short explanations of the ideas, never quotes, and the page says we are not affiliated.
 */

export type Cite = { cite: string; at: number };
export type AnswerPart = string | Cite;

export interface DemoSample {
  id: "lecture" | "book";
  tab: string;
  /** The content title, as Thoth's header shows it. */
  title: string;
  kind: "video" | "pdf";
  /** Seconds for a video, pages for a PDF. */
  length: number;
  chapters: { at: number; title: string; summary: string }[];
  questions: { q: string; answer: AnswerPart[] }[];
}

export const landing = {
  rotatingWords: ["lecture", "textbook", "paper", "PDF", "video"],
  headline: { before: "Turn any", after: "into something you remember." },
  sub: "Thoth reads your sources with you: it answers with citations, writes notes and quizzes, and schedules your flashcards. On your computer, with the model you choose.",
  stickers: ["No account", "Works offline", "Your own model", "Open source"],
  exampleNote:
    "Example: studying Martin Kleppmann's Designing Data-Intensive Applications and his Distributed Systems lectures. Thoth is not affiliated with them.",

  samples: [
    {
      id: "lecture",
      tab: "Lecture video",
      title: "Distributed Systems · Lecture 6: Consensus",
      kind: "video",
      length: 1560,
      chapters: [
        { at: 0, title: "Why agreement is hard", summary: "Nodes crash and messages are delayed." },
        {
          at: 250,
          title: "Leader election",
          summary: "One leader per term, chosen by a majority.",
        },
        {
          at: 690,
          title: "Raft: terms and votes",
          summary: "Timeouts start elections for a new term.",
        },
        { at: 1185, title: "Log replication", summary: "The leader appends; a majority commits." },
      ],
      questions: [
        {
          q: "Why does Raft need a majority?",
          answer: [
            "Any two majorities overlap, so two leaders can never win the same term ",
            { cite: "04:10", at: 250 },
            ". A new leader always reaches at least one node that saw the last committed entry ",
            { cite: "19:45", at: 1185 },
            ".",
          ],
        },
        {
          q: "What happens if the leader crashes?",
          answer: [
            "Followers stop hearing heartbeats. One times out and starts an election for a new term ",
            { cite: "11:30", at: 690 },
            ", and whoever gets votes from a majority becomes leader ",
            { cite: "04:10", at: 250 },
            ".",
          ],
        },
        {
          q: "Summarise this lecture in one line",
          answer: [
            "Consensus lets nodes agree on one order of events ",
            { cite: "00:00", at: 0 },
            ": Raft elects a leader per term ",
            { cite: "11:30", at: 690 },
            " and replicates its log to a majority ",
            { cite: "19:45", at: 1185 },
            ".",
          ],
        },
      ],
    },
    {
      id: "book",
      tab: "Book chapter",
      title: "DDIA · Chapter 9: Consistency and Consensus",
      kind: "pdf",
      length: 8,
      chapters: [
        { at: 1, title: "Consistency guarantees", summary: "From eventual to strong consistency." },
        { at: 3, title: "Linearizability", summary: "Behave as if there were one copy." },
        { at: 5, title: "Ordering guarantees", summary: "Causality and total order." },
        { at: 7, title: "Transactions and consensus", summary: "Two-phase commit and its limits." },
      ],
      questions: [
        {
          q: "What is linearizability?",
          answer: [
            "A guarantee that a replicated system behaves as if there were a single copy of the data, so every read sees the latest write ",
            { cite: "p. 3", at: 3 },
            ".",
          ],
        },
        {
          q: "Why is two-phase commit risky?",
          answer: [
            "If the coordinator crashes after everyone voted yes, the participants must wait for it, holding their locks ",
            { cite: "p. 7", at: 7 },
            ".",
          ],
        },
        {
          q: "What should I remember for the exam?",
          answer: [
            "Linearizability is a recency guarantee ",
            { cite: "p. 3", at: 3 },
            ", causal order is weaker but cheaper ",
            { cite: "p. 5", at: 5 },
            ", and consensus is how nodes agree despite failures ",
            { cite: "p. 7", at: 7 },
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
        "# Consensus",
        "Nodes agree on one value, even when some crash. [p. 7]",
        "- Raft elects one leader per term [04:10]",
        "- Two majorities always overlap",
      ],
    },
    {
      id: "quiz",
      title: "Quiz",
      tone: "tone-sage",
      blurb: "Questions by topic, graded with feedback.",
      preview: [
        "Q1. Why does Raft need votes from a majority?",
        "(●) Any two majorities overlap",
        "( ) It makes elections faster",
        "✓ Correct. So two leaders can't win one term [04:10]",
      ],
    },
    {
      id: "cards",
      title: "Flashcards",
      tone: "tone-sky",
      blurb: "Spaced repetition that comes back on time.",
      preview: [
        "Front: What does linearizability guarantee?",
        "Back: Every read sees the latest write, as if there were one copy.",
        "Next review: in 3 days",
      ],
    },
    {
      id: "map",
      title: "Mind map",
      tone: "tone-lilac",
      blurb: "The whole source on one board.",
      preview: [
        "Distributed systems",
        "├─ Replication",
        "├─ Partitioning",
        "├─ Transactions",
        "└─ Consensus",
      ],
    },
    {
      id: "exam",
      title: "Exam",
      tone: "tone-butter",
      blurb: "Timed, across your whole course.",
      preview: [
        "Distributed systems · 20 questions · 30 min",
        "Score 84%",
        "Weak spot: two-phase commit",
      ],
    },
  ],

  /** The scroll story: each beat shows a real screen of the app (a site-shots.ts screenshot). */
  story: [
    {
      title: "Add a lecture or a book.",
      body: "Paste a YouTube link, drop a PDF, or paste text. Thoth reads it and finds the chapters.",
      shot: "workspace",
    },
    {
      title: "Ask, and see where it came from.",
      body: "Every answer cites the second or the page, and a click takes you there.",
      shot: "chat",
    },
    {
      title: "Keep what matters.",
      body: "Highlight a passage and send it to your notes, with a link back to the spot.",
      shot: "notes",
    },
    {
      title: "Test yourself.",
      body: "Quizzes by topic, graded with feedback, and flashcards that come back on time.",
      shot: "quiz",
    },
    {
      title: "See the whole picture.",
      body: "A mind map of the source, with every idea linked to where it came from.",
      shot: "whiteboard",
    },
  ] as const,

  flashcard: {
    front: "What does linearizability guarantee?",
    back: "Every read sees the latest write, as if there were a single copy of the data.",
    next: { Again: "in 1 minute", Hard: "in 1 day", Good: "in 3 days", Easy: "in 8 days" },
  },

  quiz: {
    q: "A Raft candidate becomes leader when it gets votes from…",
    choices: ["any one other node", "a majority of the nodes", "every node in the cluster"],
    correct: 1,
    right: "Right. Two majorities always overlap, so there can't be two leaders in one term.",
    wrong: "Not quite. It needs a majority: any two majorities overlap.",
  },

  mindmap: ["Consensus", "Leader election", "Log replication", "Quorums"],

  models: [
    { task: "Chat", options: ["Claude", "Local"] },
    { task: "Flashcards", options: ["Claude", "Local"] },
    { task: "Quizzes", options: ["Claude", "Local"] },
  ],
};
