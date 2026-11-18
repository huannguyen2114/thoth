import { activityKinds, jobKinds } from "@thoth/core";
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
};

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ...timestamps,
});

export const contents = sqliteTable("contents", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").references(() => spaces.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["pdf", "youtube", "webpage", "text"] }).notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  filePath: text("file_path"),
  status: text("status", { enum: ["pending", "processing", "ready", "failed"] })
    .notNull()
    .default("pending"),
  error: text("error"),
  ...timestamps,
});

/** Key-value app settings (provider choice, model per task). Secrets stay in env, not here. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: timestamps.updatedAt,
});

/* ---------- MVP contracts (Step 0, docs/plan/parallel-development.md) ---------- */

type LocatorJson =
  | { type: "page"; page: number }
  | { type: "time"; startSec: number; endSec: number }
  | { type: "offset"; start: number; end: number; paragraph?: number | undefined };

/** Source text pieces. Mirrored into the FTS5 table `chunks_fts` (see migration 0001). */
export const segments = sqliteTable(
  "segments",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    text: text("text").notNull(),
    locator: text("locator", { mode: "json" }).$type<LocatorJson>().notNull(),
  },
  (t) => [index("segments_content_idx").on(t.contentId, t.idx)],
);

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    locator: text("locator", { mode: "json" }).$type<LocatorJson>().notNull(),
  },
  (t) => [index("chapters_content_idx").on(t.contentId, t.idx)],
);

export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    instructions: text("instructions"),
    ...timestamps,
  },
  (t) => [index("chats_content_idx").on(t.contentId)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    text: text("text").notNull(),
    citations: text("citations", { mode: "json" }).$type<unknown[]>().notNull().default([]),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("chat_messages_chat_idx").on(t.chatId, t.createdAt)],
);

export const studySets = sqliteTable(
  "study_sets",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["summary", "quiz", "flashcards", "exam"] }).notNull(),
    contentId: text("content_id").references(() => contents.id, { onDelete: "cascade" }),
    spaceId: text("space_id").references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    options: text("options", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    body: text("body"),
    status: text("status", { enum: ["generating", "ready", "failed"] })
      .notNull()
      .default("ready"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [
    index("study_sets_content_idx").on(t.contentId, t.kind),
    index("study_sets_space_idx").on(t.spaceId, t.kind),
  ],
);

export const notes = sqliteTable("notes", {
  contentId: text("content_id")
    .primaryKey()
    .references(() => contents.id, { onDelete: "cascade" }),
  markdown: text("markdown").notNull(),
  updatedAt: timestamps.updatedAt,
});

export const quizQuestions = sqliteTable(
  "quiz_questions",
  {
    id: text("id").primaryKey(),
    setId: text("set_id")
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    type: text("type", {
      enum: ["multiple_choice", "multi_select", "free_response", "true_false", "fill_blank"],
    }).notNull(),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(),
    prompt: text("prompt").notNull(),
    choices: text("choices", { mode: "json" }).$type<string[] | null>(),
    answer: text("answer", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    explanation: text("explanation").notNull(),
    topic: text("topic").notNull(),
    locator: text("locator", { mode: "json" }).$type<LocatorJson | null>(),
    /** Source content of an exam question (ADR-0018); null for per-content quizzes. */
    contentId: text("content_id").references(() => contents.id, { onDelete: "set null" }),
  },
  (t) => [index("quiz_questions_set_idx").on(t.setId, t.idx)],
);

export const quizAttempts = sqliteTable(
  "quiz_attempts",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "cascade" }),
    response: text("response", { mode: "json" }).notNull(),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    score: real("score").notNull(),
    feedback: text("feedback"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("quiz_attempts_question_idx").on(t.questionId)],
);

export const flashcards = sqliteTable(
  "flashcards",
  {
    id: text("id").primaryKey(),
    setId: text("set_id")
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    front: text("front").notNull(),
    back: text("back").notNull(),
    topic: text("topic").notNull(),
    locator: text("locator", { mode: "json" }).$type<LocatorJson | null>(),
    due: integer("due", { mode: "timestamp_ms" }).notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    elapsedDays: real("elapsed_days").notNull(),
    scheduledDays: real("scheduled_days").notNull(),
    reps: integer("reps").notNull(),
    lapses: integer("lapses").notNull(),
    state: integer("state").notNull(),
    lastReview: integer("last_review", { mode: "timestamp_ms" }),
  },
  (t) => [index("flashcards_set_idx").on(t.setId, t.idx), index("flashcards_due_idx").on(t.due)],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("reviews_card_idx").on(t.cardId)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: jobKinds }).notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["queued", "running", "done", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    runAfter: integer("run_after", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (t) => [index("jobs_runnable_idx").on(t.status, t.runAfter)],
);

/** One timed sitting of an exam study set (ADR-0018). */
export const examSessions = sqliteTable(
  "exam_sessions",
  {
    id: text("id").primaryKey(),
    setId: text("set_id")
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    deadlineAt: integer("deadline_at", { mode: "timestamp_ms" }).notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    score: real("score"),
  },
  (t) => [index("exam_sessions_set_idx").on(t.setId, t.startedAt)],
);

/** Habit tracker log (ADR-0023). Backfilled from existing data by migration 0005. */
export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: activityKinds }).notNull(),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    ref: text("ref"),
  },
  (t) => [
    index("activity_events_at_idx").on(t.at),
    index("activity_events_ref_idx").on(t.kind, t.ref),
  ],
);

/* ---------- Study planner (ADR-0030) ---------- */
export const studyPlans = sqliteTable("study_plans", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  goalDate: text("goal_date").notNull(),
  minutesPerDay: integer("minutes_per_day").notNull(),
  studyDays: text("study_days", { mode: "json" }).$type<number[]>().notNull(),
  spaceId: text("space_id").references(() => spaces.id, { onDelete: "set null" }),
  contentIds: text("content_ids", { mode: "json" }).$type<string[]>().notNull(),
  ...timestamps,
});

export const planItems = sqliteTable(
  "plan_items",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => studyPlans.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    idx: integer("idx").notNull(),
    kind: text("kind", { enum: ["learn", "quiz", "review", "exam", "rest"] }).notNull(),
    title: text("title").notNull(),
    minutes: integer("minutes").notNull(),
    contentId: text("content_id").references(() => contents.id, { onDelete: "set null" }),
    topic: text("topic"),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("plan_items_plan_idx").on(t.planId, t.day, t.idx),
    index("plan_items_day_idx").on(t.day),
  ],
);

/* ---------- Whiteboards (ADR-0031) ---------- */
export const whiteboards = sqliteTable(
  "whiteboards",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id").references(() => contents.id, { onDelete: "cascade" }),
    spaceId: text("space_id").references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    elements: text("elements", { mode: "json" }).$type<unknown[]>().notNull(),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("whiteboards_content_idx").on(t.contentId),
    index("whiteboards_space_idx").on(t.spaceId),
  ],
);
