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
  /** Video only: the YouTube video, loaded only after the visitor clicks. */
  youtubeId?: string;
  by?: string;
  /** PDF only: the example file and the text of its pages. */
  pdf?: string;
  pages?: { heading: string; text: string[] }[];
}

export const landing = {
  rotatingWords: ["lecture", "textbook", "paper", "PDF", "video"],
  headline: { before: "Turn any", after: "into something you remember." },
  sub: "Thoth reads your sources with you: it answers with citations, writes notes and quizzes, and schedules your flashcards. On your computer, with the model you choose.",
  stickers: ["No account", "Works offline", "Your own model", "Open source"],
  exampleNote:
    "Examples: Martin Kleppmann's lecture Distributed Systems 6.1: Consensus (played from YouTube), and a short example chapter we wrote on the same topic. Thoth is not affiliated with him.",

  samples: [
    {
      id: "lecture",
      tab: "Lecture video",
      title: "Distributed Systems 6.1: Consensus",
      kind: "video",
      youtubeId: "rN6ma561tak",
      by: "Martin Kleppmann, University of Cambridge",
      length: 1094,
      // Chapter times and citations point at the real moments of the lecture.
      chapters: [
        {
          at: 0,
          title: "When the leader fails",
          summary: "A single leader orders messages, until it crashes.",
        },
        {
          at: 76,
          title: "Manual failover",
          summary: "A person picks a new leader, often at 3 a.m.",
        },
        {
          at: 193,
          title: "What consensus means",
          summary: "Nodes propose values and all decide on one.",
        },
        {
          at: 302,
          title: "Paxos, Raft and friends",
          summary: "The classic algorithms and what they provide.",
        },
        {
          at: 352,
          title: "System models and FLP",
          summary: "Why we assume partial synchrony and timeouts.",
        },
        {
          at: 618,
          title: "Leader election, split brain",
          summary: "Never two leaders deciding at once.",
        },
        {
          at: 721,
          title: "Terms and quorums",
          summary: "One vote per node per term; a majority wins.",
        },
        {
          at: 957,
          title: "Two rounds of voting",
          summary: "A leader asks a quorum before it decides.",
        },
      ],
      questions: [
        {
          q: "Why does Raft need a majority?",
          answer: [
            "Each node votes at most once per term ",
            { cite: "12:32", at: 752 },
            ", so with a majority quorum two candidates can never both win the same term ",
            { cite: "13:27", at: 807 },
            ". With five nodes, any three can elect a leader, so two can be down ",
            { cite: "13:42", at: 822 },
            ".",
          ],
        },
        {
          q: "What is split brain?",
          answer: [
            "Two nodes that both believe they are the leader, which can corrupt or lose data ",
            { cite: "11:38", at: 698 },
            ". After a network partition it can still happen across terms ",
            { cite: "14:31", at: 871 },
            ", so a leader must ask a quorum before it decides anything ",
            { cite: "16:06", at: 966 },
            ".",
          ],
        },
        {
          q: "Why not a fully asynchronous system?",
          answer: [
            "The FLP result proves that no consensus algorithm can always terminate there ",
            { cite: "07:36", at: 456 },
            ", so Raft and Paxos assume partial synchrony and use timeouts ",
            { cite: "08:23", at: 503 },
            ". Timing only affects liveness, never safety ",
            { cite: "09:14", at: 554 },
            ".",
          ],
        },
      ],
    },
    {
      id: "book",
      tab: "Book chapter (PDF)",
      title: "Consistency and Consensus: a short example chapter",
      kind: "pdf",
      length: 4,
      pdf: "/examples/consistency-and-consensus.pdf",
      pages: [
        {
          heading: "1. Consistency guarantees",
          text: [
            "Replicas of the same data can briefly disagree while writes travel between them.",
            "Eventual consistency only promises that replicas converge once writes stop.",
            "Stronger guarantees are easier to reason about, but need more coordination.",
          ],
        },
        {
          heading: "2. Linearizability",
          text: [
            "A linearizable system behaves as if there were a single copy of the data.",
            "Once any read has returned a new value, every later read returns it too.",
            "It is a recency guarantee, and it costs latency when the network is slow.",
          ],
        },
        {
          heading: "3. Ordering and causality",
          text: [
            "Causal order keeps every cause before its effect, and is cheaper than a total order.",
            "Total order broadcast delivers every message to every node in the same order.",
            "With total order broadcast, replicas can apply the same writes in the same order.",
          ],
        },
        {
          heading: "4. Consensus",
          text: [
            "Consensus gets nodes to agree on one value, even when some of them crash.",
            "A majority quorum means any two decisions share at least one node.",
            "Raft elects one leader per term, and the leader asks a quorum before it commits.",
          ],
        },
      ],
      chapters: [
        { at: 1, title: "Consistency guarantees", summary: "From eventual to strong." },
        { at: 2, title: "Linearizability", summary: "As if there were one copy." },
        { at: 3, title: "Ordering and causality", summary: "Causal order and total order." },
        { at: 4, title: "Consensus", summary: "Agreement despite crashes." },
      ],
      questions: [
        {
          q: "What is linearizability?",
          answer: [
            "A guarantee that the system behaves as if there were a single copy of the data, so a read never goes back to an older value ",
            { cite: "p. 2", at: 2 },
            ".",
          ],
        },
        {
          q: "Why does consensus use a majority?",
          answer: [
            "Any two majorities share at least one node, so two decisions can never contradict each other ",
            { cite: "p. 4", at: 4 },
            ".",
          ],
        },
        {
          q: "What should I remember for the exam?",
          answer: [
            "Linearizability is a recency guarantee ",
            { cite: "p. 2", at: 2 },
            ", causal order is weaker but cheaper ",
            { cite: "p. 3", at: 3 },
            ", and consensus is how nodes agree despite crashes ",
            { cite: "p. 4", at: 4 },
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

  /**
   * The scroll story: one beat per step of studying, each a short walkthrough over real
   * screenshots of the app (site-shots.ts). A step shows a frame, moves the cursor to a hotspot
   * recorded on that frame (content/hotspots.json), optionally clicks, and shows a tip.
   */
  story: [
    {
      title: "Add a lecture or a book.",
      body: "On the home page, paste a YouTube link, upload a PDF, or paste text.",
      steps: [
        { shot: "home", at: "linkTab", click: true, tip: "Open the Link tab" },
        { shot: "home-link", at: "urlField", tip: "Paste a YouTube link (or upload a PDF)" },
        { shot: "home-link", at: "addButton", click: true, tip: "Add it" },
        { shot: "workspace", tip: "Ready: the source, its chapters and a chat" },
      ],
    },
    {
      title: "Ask, and see where it came from.",
      body: "Every answer cites the second or the page, and a click takes you there.",
      steps: [
        { shot: "workspace", at: "chatInput", click: true, tip: "Ask a question" },
        { shot: "workspace", at: "send", click: true, tip: "Send it" },
        { shot: "chat", at: "chip", tip: "Each answer cites its source" },
        { shot: "chat", at: "chip", click: true, tip: "Click to jump to that page" },
      ],
    },
    {
      title: "Keep what matters.",
      body: "Select a passage and send it to your notes, with a link back to the spot.",
      steps: [
        { shot: "pdf-select", at: "addToNotes", tip: "Select a passage" },
        { shot: "pdf-select", at: "addToNotes", click: true, tip: "Add it to your notes" },
        { shot: "notes", at: "quote", tip: "Quoted, with a link back to the page" },
      ],
    },
    {
      title: "Test yourself.",
      body: "Quizzes by topic, graded with feedback, and flashcards that come back on time.",
      steps: [
        { shot: "quiz-q", at: "answer", click: true, tip: "Pick an answer" },
        { shot: "quiz-q", at: "check", click: true, tip: "Check it" },
        { shot: "quiz", at: "feedback", tip: "Feedback, with the source" },
      ],
    },
    {
      title: "See the whole picture.",
      body: "A mind map of the source, with every idea linked to where it came from.",
      steps: [
        { shot: "whiteboard-empty", at: "makeMap", click: true, tip: "Make a mind map" },
        { shot: "whiteboard", at: "root", tip: "Every node links back to the source" },
      ],
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
