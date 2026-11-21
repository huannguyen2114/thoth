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
  type LlmKeyEnvVar,
  type LlmProvider,
  type LlmTask,
  type NoteRepository,
  type PlanRepository,
  type QuizRepository,
  type Result,
  resolveProviderKey,
  type SecretStore,
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
import { SourceIngestor } from "@thoth/ingest";
import {
  createLlmProvider,
  type ProbeResult,
  probeOpenAiCompatible,
  ScriptedLlmProvider,
} from "@thoth/llm";
import { env } from "./env";
import { KeychainSecretStore } from "./secrets";

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
  /**
   * Built per call from saved settings, so a settings change applies immediately.
   * Without a task it is a router that sends each request to its `request.task`'s profile and
   * model (doc 20); with a task it is that task's concrete adapter.
   */
  llm(task?: LlmTask): Promise<LlmProvider>;
  /** API keys in the OS keychain (ADR-0037). Never read by client code. */
  secrets: SecretStore;
  /** Which key env vars are set. Booleans only: keys never leave the server. */
  llmKeyEnv: Record<LlmKeyEnvVar, boolean>;
  /**
   * "Test connection" for an OpenAI-compatible base URL: lists models, probes json_schema.
   * Without a typed key it uses the profile's saved key, or the env var for that host.
   */
  probeLlm(input: {
    profileId?: string | undefined;
    name: string;
    baseUrl: string;
    apiKey?: string | undefined;
    model?: string | undefined;
  }): Promise<Result<ProbeResult>>;
  hasAnthropicApiKey: boolean;
}

let ready: Promise<Container> | undefined;
const scripted = new ScriptedLlmProvider();

async function build(): Promise<Container> {
  const db = createDb(`file:${resolve(env.THOTH_DATA_DIR, "thoth.db")}`);
  await migrateDb(db, env.THOTH_MIGRATIONS_DIR);
  const settings = new DrizzleSettingsRepository(db);
  const secrets = await KeychainSecretStore.create();
  const keyEnv = {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
  };
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
    llm: async (task) => {
      if (env.THOTH_LLM === "scripted") return scripted;
      const router = createLlmProvider(await getLlmSettings({ settings }), {
        resolveKey: (profile) => resolveProviderKey({ secrets, env: keyEnv }, profile),
      });
      return task ? router.forTask(task) : router;
    },
    secrets,
    llmKeyEnv: {
      ANTHROPIC_API_KEY: Boolean(env.ANTHROPIC_API_KEY),
      OPENAI_API_KEY: Boolean(env.OPENAI_API_KEY),
      OPENROUTER_API_KEY: Boolean(env.OPENROUTER_API_KEY),
    },
    probeLlm: async ({ profileId, apiKey, ...rest }) => {
      const saved = profileId
        ? (await getLlmSettings({ settings })).profiles.find((p) => p.id === profileId)
        : undefined;
      const key =
        apiKey ||
        (await resolveProviderKey(
          { secrets, env: keyEnv },
          { kind: "openai-compatible", baseUrl: rest.baseUrl, keyRef: saved?.keyRef ?? null },
        ));
      return probeOpenAiCompatible({ ...rest, apiKey: key });
    },
    hasAnthropicApiKey: Boolean(env.ANTHROPIC_API_KEY),
  };
}

export function getContainer(): Promise<Container> {
  ready ??= build();
  return ready;
}
