import "server-only";
import { resolve } from "node:path";
import {
  type ActivityRepository,
  type AnnotationRepository,
  type ChapterRepository,
  type ChatRepository,
  type ContentRepository,
  type EmbeddingProvider,
  type ExamSessionRepository,
  type FlashcardRepository,
  getLlmSettings,
  type JobRepository,
  type LinkRepository,
  type LlmProvider,
  type NoteRepository,
  type PlanRepository,
  type PlaylistLister,
  type QuizRepository,
  type SegmentRepository,
  type SettingsRepository,
  type SourceParser,
  type SpaceRepository,
  type StudySetRepository,
  type TagRepository,
  type VectorRepository,
  type WhiteboardRepository,
} from "@thoth/core";
import {
  createDb,
  DrizzleActivityRepository,
  DrizzleAnnotationRepository,
  DrizzleChapterRepository,
  DrizzleChatRepository,
  DrizzleContentRepository,
  DrizzleExamSessionRepository,
  DrizzleFlashcardRepository,
  DrizzleJobRepository,
  DrizzleLinkRepository,
  DrizzleNoteRepository,
  DrizzlePlanRepository,
  DrizzleQuizRepository,
  DrizzleSegmentRepository,
  DrizzleSettingsRepository,
  DrizzleSpaceRepository,
  DrizzleStudySetRepository,
  DrizzleTagRepository,
  DrizzleVectorRepository,
  DrizzleWhiteboardRepository,
  migrateDb,
} from "@thoth/db";
import { FakeEmbeddingProvider, TransformersEmbeddingProvider } from "@thoth/embeddings";
import { SourceIngestor, YoutubePlaylistLister } from "@thoth/ingest";
import { createLlmProvider, ScriptedLlmProvider } from "@thoth/llm";
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
  examSessions: ExamSessionRepository;
  notes: NoteRepository;
  quizzes: QuizRepository;
  flashcards: FlashcardRepository;
  jobs: JobRepository;
  activity: ActivityRepository;
  plans: PlanRepository;
  whiteboards: WhiteboardRepository;
  vectors: VectorRepository;
  /** Phase 10 (docs 21, 22). */
  annotations: AnnotationRepository;
  links: LinkRepository;
  tags: TagRepository;
  /** Local embeddings (ADR-0029). Phase 9 Lane 2 fills this slot. */
  embeddings?: EmbeddingProvider;
  settings: SettingsRepository;
  /** Source parsers (PDF, YouTube, web page, text) used by ingest jobs. */
  ingest: SourceParser;
  /** Lists YouTube playlist videos for bulk add (Phase 10, doc 22). */
  playlists: PlaylistLister;
  /** Built per call from saved settings, so a settings change applies immediately. */
  llm(): Promise<LlmProvider>;
  hasAnthropicApiKey: boolean;
}

let ready: Promise<Container> | undefined;
const scripted = new ScriptedLlmProvider();

async function build(): Promise<Container> {
  const db = createDb(`file:${resolve(env.THOTH_DATA_DIR, "thoth.db")}`);
  await migrateDb(db, env.THOTH_MIGRATIONS_DIR);
  const settings = new DrizzleSettingsRepository(db);
  return {
    spaces: new DrizzleSpaceRepository(db),
    contents: new DrizzleContentRepository(db),
    segments: new DrizzleSegmentRepository(db),
    chapters: new DrizzleChapterRepository(db),
    chats: new DrizzleChatRepository(db),
    studySets: new DrizzleStudySetRepository(db),
    examSessions: new DrizzleExamSessionRepository(db),
    notes: new DrizzleNoteRepository(db),
    quizzes: new DrizzleQuizRepository(db),
    flashcards: new DrizzleFlashcardRepository(db),
    jobs: new DrizzleJobRepository(db),
    activity: new DrizzleActivityRepository(db),
    settings,
    ingest: new SourceIngestor(),
    playlists: new YoutubePlaylistLister(),
    plans: new DrizzlePlanRepository(db),
    whiteboards: new DrizzleWhiteboardRepository(db),
    vectors: new DrizzleVectorRepository(db),
    annotations: new DrizzleAnnotationRepository(db),
    links: new DrizzleLinkRepository(db),
    tags: new DrizzleTagRepository(db),
    // Scripted (browser-test) runs use word-hash vectors: no 135 MB download, same code path.
    embeddings:
      env.THOTH_LLM === "scripted"
        ? new FakeEmbeddingProvider()
        : new TransformersEmbeddingProvider({ cacheDir: resolve(env.THOTH_DATA_DIR, "models") }),
    llm: async () =>
      env.THOTH_LLM === "scripted"
        ? scripted
        : createLlmProvider(await getLlmSettings({ settings }), {
            anthropicApiKey: env.ANTHROPIC_API_KEY,
          }),
    hasAnthropicApiKey: Boolean(env.ANTHROPIC_API_KEY),
  };
}

export function getContainer(): Promise<Container> {
  ready ??= build();
  return ready;
}
