import type { Content, Segment } from "../../domain/content";
import type { Job } from "../../domain/job";
import type { IngestSource, SourceParser } from "../../ports/ingest";
import type { LlmProvider } from "../../ports/llm";
import type {
  ChapterRepository,
  ContentRepository,
  JobRepository,
  SegmentRepository,
} from "../../ports/repositories";
import type { ContentId } from "../../shared/id";
import type { AppError } from "../../shared/result";
import { type IngestJobPayload, ingestJobPayload } from "./add-content";
import { generateChapters } from "./chapters";

export interface IngestDeps {
  contents: ContentRepository;
  segments: SegmentRepository;
  chapters: ChapterRepository;
  jobs: JobRepository;
  parser: SourceParser;
  llm: () => Promise<LlmProvider>;
  /** Called when an `embed` job is claimed; the web app wakes its indexer (ADR-0029). */
  onEmbedJob?: () => void;
}

/** Attempts per job, counting the first one. */
export const MAX_ATTEMPTS = 3;
/** Wait before attempt 2 and attempt 3. */
export const RETRY_DELAYS_MS = [15_000, 60_000] as const;

export type IngestOutcome =
  | { status: "ready" }
  | { status: "retry"; message: string }
  | { status: "failed"; message: string };

/**
 * Turns a content into segments and chapters:
 * `processing` → parse → save segments → write chapters → `ready`.
 *
 * On a transient failure (network, LLM unavailable or malformed) with attempts left, the
 * content stays `processing` with a "trying again" note and the outcome is `retry`.
 * Otherwise the content becomes `failed` with a message that says what to do.
 */
export async function runIngestJob(
  deps: IngestDeps,
  payload: IngestJobPayload,
  attempt: { isLast: boolean },
  signal?: AbortSignal,
): Promise<IngestOutcome> {
  const contentId = payload.contentId as ContentId;
  const content = await deps.contents.get(contentId);
  if (!content) return { status: "failed", message: "Content was deleted before ingestion." };

  await deps.contents.setStatus(contentId, "processing", null);
  const outcome = await ingest(deps, content, payload, signal);
  if (outcome.ok) {
    await deps.contents.setStatus(contentId, "ready", null);
    // Vectors come later, in the background: the content is usable now (ADR-0029).
    await deps.jobs.enqueue("embed", { contentId });
    return { status: "ready" };
  }

  const { message, retryable } = outcome;
  if (retryable && !attempt.isLast) {
    await deps.contents.setStatus(contentId, "processing", `${message} Trying again shortly.`);
    return { status: "retry", message };
  }
  await deps.contents.setStatus(contentId, "failed", message);
  return { status: "failed", message };
}

type Step = { ok: true } | { ok: false; message: string; retryable: boolean };

async function ingest(
  deps: IngestDeps,
  content: Content,
  payload: IngestJobPayload,
  signal?: AbortSignal,
): Promise<Step> {
  // 1. Segments: parse the source, or re-use saved ones for pasted text on a retry.
  let segments: Segment[];
  const source = toSource(content, payload);
  if (source) {
    const parsed = await deps.parser.parse(source, signal);
    if (!parsed.ok) return { ok: false, ...parsed.error };
    await deps.segments.replaceForContent(content.id, parsed.value.segments);
    if (parsed.value.title) await deps.contents.setTitle(content.id, parsed.value.title);
    segments = await deps.segments.listByContent(content.id);
  } else {
    segments = await deps.segments.listByContent(content.id);
    if (segments.length === 0) {
      return {
        ok: false,
        retryable: false,
        message: missingSourceMessage(content),
      };
    }
  }

  // 2. Chapters.
  const title = (await deps.contents.get(content.id))?.title ?? content.title;
  const chapters = await generateChapters(await deps.llm(), title, segments, signal);
  if (!chapters.ok) return { ok: false, ...chapterFailure(chapters.error) };
  await deps.chapters.replaceForContent(content.id, chapters.value);
  return { ok: true };
}

function toSource(content: Content, payload: IngestJobPayload): IngestSource | null {
  switch (content.kind) {
    case "pdf":
      return content.filePath
        ? { kind: "pdf", filePath: content.filePath, fileName: `${content.title}.pdf` }
        : null;
    case "youtube":
    case "webpage":
      return content.sourceUrl ? { kind: content.kind, url: content.sourceUrl } : null;
    case "text":
      return payload.text ? { kind: "text", text: payload.text } : null;
  }
}

function missingSourceMessage(content: Content): string {
  switch (content.kind) {
    case "text":
      return "The pasted text was not saved. Paste it again.";
    case "pdf":
      return "The uploaded file is missing. Upload the PDF again.";
    default:
      return "The link is missing. Add it again.";
  }
}

function chapterFailure(e: AppError): { message: string; retryable: boolean } {
  switch (e.code) {
    case "llm_unavailable":
      return {
        retryable: true,
        message: `We could not reach the model to write chapters. ${e.message}`,
      };
    case "llm_bad_output":
      return {
        retryable: true,
        message:
          "The model returned chapters we could not read. Try again, or pick another model for Chapters in Settings.",
      };
    case "llm_refused":
      return {
        retryable: false,
        message: "The model declined to write chapters for this source. Try a different source.",
      };
    default:
      return { retryable: true, message: e.message };
  }
}

export type JobRunResult = "idle" | "done" | "retry" | "failed";

/**
 * Claims the next runnable job and runs it. Called in a loop by the in-process runner
 * (apps/web/src/server/jobs). Retries transient failures with backoff, at most MAX_ATTEMPTS.
 */
export async function processNextJob(
  deps: IngestDeps,
  now: () => Date = () => new Date(),
  signal?: AbortSignal,
): Promise<JobRunResult> {
  const job = await deps.jobs.claimNext(now());
  if (!job) return "idle";
  return runJob(deps, job, now, signal);
}

async function runJob(
  deps: IngestDeps,
  job: Job,
  now: () => Date,
  signal?: AbortSignal,
): Promise<JobRunResult> {
  if (job.kind === "embed") {
    // A signal only: the indexer embeds every missing segment in batches (ADR-0029).
    await deps.jobs.complete(job.id);
    deps.onEmbedJob?.();
    return "done";
  }
  const payload = ingestJobPayload.safeParse(job.payload);
  if (job.kind !== "ingest" || !payload.success) {
    await deps.jobs.fail(job.id, `Unknown job: ${job.kind}`, null);
    return "failed";
  }

  const isLast = job.attempts >= MAX_ATTEMPTS;
  let outcome: IngestOutcome;
  try {
    outcome = await runIngestJob(deps, payload.data, { isLast }, signal);
  } catch (e) {
    // A bug or an infrastructure fault (ADR-0005). Record it so the content is not stuck.
    const message = isLast
      ? "Something went wrong while reading this source. Try again."
      : "Something went wrong while reading this source. Trying again shortly.";
    await deps.contents
      .setStatus(payload.data.contentId as ContentId, isLast ? "failed" : "processing", message)
      .catch(() => undefined);
    await deps.jobs.fail(
      job.id,
      e instanceof Error ? (e.stack ?? e.message) : String(e),
      isLast ? null : retryAt(job, now),
    );
    return isLast ? "failed" : "retry";
  }

  switch (outcome.status) {
    case "ready":
      await deps.jobs.complete(job.id);
      return "done";
    case "retry":
      await deps.jobs.fail(job.id, outcome.message, retryAt(job, now));
      return "retry";
    case "failed":
      await deps.jobs.fail(job.id, outcome.message, null);
      return "failed";
  }
}

const retryAt = (job: Job, now: () => Date) =>
  new Date(
    now().getTime() + (RETRY_DELAYS_MS[job.attempts - 1] ?? RETRY_DELAYS_MS.at(-1) ?? 60_000),
  );
