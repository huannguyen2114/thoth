import "server-only";
import { resolve } from "node:path";
import {
  type ChapterRepository,
  type ChatRepository,
  type ContentRepository,
  type FlashcardRepository,
  getLlmSettings,
  type JobRepository,
  type LlmProvider,
  type NoteRepository,
  type QuizRepository,
  type SegmentRepository,
  type SettingsRepository,
  type SourceParser,
  type SpaceRepository,
  type StudySetRepository,
} from "@thoth/core";
import {
  createDb,
  DrizzleChapterRepository,
  DrizzleChatRepository,
  DrizzleContentRepository,
  DrizzleFlashcardRepository,
  DrizzleJobRepository,
  DrizzleNoteRepository,
  DrizzleQuizRepository,
  DrizzleSegmentRepository,
  DrizzleSettingsRepository,
  DrizzleSpaceRepository,
  DrizzleStudySetRepository,
  migrateDb,
} from "@thoth/db";
import { SourceIngestor } from "@thoth/ingest";
import { createLlmProvider } from "@thoth/llm";
import { env } from "./env";

/**
 * Composition root: the ONLY place that wires adapters to ports.
 * UI code asks for the container; it never imports @thoth/db or @thoth/llm directly.
 * See docs/technical_design/01-architecture.md.
 */
export interface Container {
  spaces: SpaceRepository;
  contents: ContentRepository;
  segments: SegmentRepository;
  chapters: ChapterRepository;
  chats: ChatRepository;
  studySets: StudySetRepository;
  notes: NoteRepository;
  quizzes: QuizRepository;
  flashcards: FlashcardRepository;
  jobs: JobRepository;
  settings: SettingsRepository;
  /** Source parsers (PDF, YouTube, web page, text) used by ingest jobs. */
  ingest: SourceParser;
  /** Built per call from saved settings, so a settings change applies immediately. */
  llm(): Promise<LlmProvider>;
  hasAnthropicApiKey: boolean;
}

let ready: Promise<Container> | undefined;

async function build(): Promise<Container> {
  const db = createDb(`file:${resolve(env.THOTH_DATA_DIR, "thoth.db")}`);
  await migrateDb(db, resolve(process.cwd(), "../../packages/db/drizzle"));
  const settings = new DrizzleSettingsRepository(db);
  return {
    spaces: new DrizzleSpaceRepository(db),
    contents: new DrizzleContentRepository(db),
    segments: new DrizzleSegmentRepository(db),
    chapters: new DrizzleChapterRepository(db),
    chats: new DrizzleChatRepository(db),
    studySets: new DrizzleStudySetRepository(db),
    notes: new DrizzleNoteRepository(db),
    quizzes: new DrizzleQuizRepository(db),
    flashcards: new DrizzleFlashcardRepository(db),
    jobs: new DrizzleJobRepository(db),
    settings,
    ingest: new SourceIngestor(),
    llm: async () =>
      createLlmProvider(await getLlmSettings({ settings }), {
        anthropicApiKey: env.ANTHROPIC_API_KEY,
      }),
    hasAnthropicApiKey: Boolean(env.ANTHROPIC_API_KEY),
  };
}

export function getContainer(): Promise<Container> {
  ready ??= build();
  return ready;
}
