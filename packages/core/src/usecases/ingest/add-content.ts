import { z } from "zod";
import type { Content, ContentKind, NewContent } from "../../domain/content";
import type {
  ActivityRepository,
  ContentRepository,
  JobRepository,
} from "../../ports/repositories";
import type { ContentId, SpaceId } from "../../shared/id";
import { type AppError, appError, err, ok, type Result } from "../../shared/result";
import { recordActivity } from "../activity";
import { detectLinkKind } from "./source-url";

export interface AddContentDeps {
  contents: ContentRepository;
  jobs: JobRepository;
  activity?: ActivityRepository;
}

/** Longest pasted text we accept: about a 500-page book. */
export const MAX_PASTE_CHARS = 1_000_000;

const spaceId = z
  .string()
  .min(1)
  .nullish()
  .transform((v) => (v ? (v as SpaceId) : null));

export const addContentInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("link"),
    url: z.string().trim().min(1, "Paste a YouTube or web page link."),
    spaceId,
  }),
  z.object({
    kind: z.literal("text"),
    text: z
      .string()
      .refine((t) => t.trim().length > 0, "Paste some text first.")
      .refine(
        (t) => t.length <= MAX_PASTE_CHARS,
        "This text is over 1,000,000 characters. Paste a shorter part.",
      ),
    spaceId,
  }),
  z.object({
    kind: z.literal("pdf"),
    /** Where the upload route saved the file. */
    filePath: z.string().min(1),
    fileName: z.string().trim().min(1).max(255),
    spaceId,
  }),
]);
export type AddContentInput = z.input<typeof addContentInput>;

/** What the `ingest` job carries. Text lives here because contents have no body column. */
export const ingestJobPayload = z.object({
  contentId: z.string().min(1),
  text: z.string().optional(),
});
export type IngestJobPayload = z.infer<typeof ingestJobPayload>;

/**
 * Creates a `pending` content with a placeholder title and queues an `ingest` job.
 * The job runner parses the source, writes segments and chapters, and sets the real title.
 */
export async function addContent(
  deps: AddContentDeps,
  input: AddContentInput,
): Promise<Result<Content, AppError>> {
  const parsed = addContentInput.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Check the input."));
  }
  const data = parsed.data;

  let content: NewContent;
  let text: string | undefined;
  switch (data.kind) {
    case "link": {
      const kind = detectLinkKind(data.url);
      if (!kind) {
        return err(
          appError(
            "validation",
            "Enter a full link that starts with https://, like https://youtu.be/…",
          ),
        );
      }
      content = newContent(kind, placeholderTitle(data.url), data.spaceId, { sourceUrl: data.url });
      break;
    }
    case "text":
      text = data.text;
      content = newContent("text", "Pasted text", data.spaceId, {});
      break;
    case "pdf":
      content = newContent("pdf", data.fileName.replace(/\.pdf$/i, ""), data.spaceId, {
        filePath: data.filePath,
      });
      break;
  }

  const created = await deps.contents.create(content);
  const payload: IngestJobPayload = { contentId: created.id, ...(text ? { text } : {}) };
  await deps.jobs.enqueue("ingest", payload);
  await recordActivity(deps.activity, "content_added", created.id);
  return ok(created);
}

/**
 * Queues a failed content for another try. Pasted text is re-used from its saved segments,
 * so retrying works even though the original job payload is gone.
 */
export async function retryContent(
  deps: AddContentDeps,
  contentId: ContentId,
): Promise<Result<Content, AppError>> {
  const content = await deps.contents.get(contentId);
  if (!content) return err(appError("not_found", "This item no longer exists. Add it again."));
  if (content.status !== "failed") {
    return err(appError("conflict", "This item is not in a failed state."));
  }
  await deps.contents.setStatus(content.id, "pending", null);
  await deps.jobs.enqueue("ingest", { contentId: content.id } satisfies IngestJobPayload);
  return ok({ ...content, status: "pending", error: null });
}

function newContent(
  kind: ContentKind,
  title: string,
  spaceId: SpaceId | null,
  source: { sourceUrl?: string; filePath?: string },
): NewContent {
  return {
    kind,
    title,
    spaceId,
    sourceUrl: source.sourceUrl ?? null,
    filePath: source.filePath ?? null,
  };
}

function placeholderTitle(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`.slice(
      0,
      120,
    );
  } catch {
    return url.slice(0, 120);
  }
}
