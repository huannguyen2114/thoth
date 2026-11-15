import { z } from "zod";
import { formatClock } from "../../domain/citation";
import type { StudySet } from "../../domain/study-set";
import type { LlmProvider } from "../../ports/llm";
import type {
  ContentRepository,
  SegmentRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type { ContentId, StudySetId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import {
  buildSourceContext,
  buildSummarySystem,
  summaryTemplateLabels,
  summaryTemplates,
  summaryUserMessage,
} from "./prompts";
import {
  describeRange,
  type SourceBounds,
  selectSegments,
  sourceBounds,
  summaryRangeSchema,
} from "./ranges";

export interface SummaryDeps {
  contents: ContentRepository;
  segments: SegmentRepository;
  studySets: StudySetRepository;
  /** Built per call so a settings change applies at once (see container.llm). */
  llm: () => Promise<LlmProvider>;
  /** Minimum gap between partial-text saves while streaming. Default 1000 ms. */
  flushIntervalMs?: number;
  now?: () => Date;
}

/** About 150k tokens. Past this, ask the student to pick a range instead of failing inside the model. */
export const MAX_SOURCE_CHARS = 600_000;

/** A "generating" set older than this is treated as interrupted (the server was restarted). */
export const STALE_GENERATING_MS = 15 * 60 * 1000;

export const summaryOptionsSchema = z.object({
  template: z.enum(summaryTemplates),
  customPrompt: z
    .string()
    .trim()
    .max(1000, "Keep the custom prompt under 1000 characters.")
    .optional(),
  language: z.string().trim().min(1, "Choose a language.").max(40).default("English"),
  ranges: z.array(summaryRangeSchema).max(10, "Use at most 10 ranges.").default([]),
});
export type SummaryOptions = z.infer<typeof summaryOptionsSchema>;
export type SummaryOptionsInput = z.input<typeof summaryOptionsSchema>;

export interface SummaryRun {
  /** The new set, status "generating". */
  set: StudySet;
  /** Streams the model reply into the set and ends it as "ready" or "failed". Never throws. */
  run(): Promise<void>;
}

function titleFor(options: SummaryOptions): string {
  const base = `${summaryTemplateLabels[options.template]} summary`;
  if (options.ranges.length === 0) return base;
  return `${base} · ${options.ranges.map((r) => describeRange(r, formatClock)).join(", ")}`;
}

/**
 * Validates the options, picks the segments inside the ranges and creates the set
 * (status "generating"). Call `run()` on the result to do the slow part, e.g. inside `after()`.
 */
export async function startSummary(
  deps: SummaryDeps,
  contentId: ContentId,
  input: SummaryOptionsInput,
): Promise<Result<SummaryRun>> {
  const parsed = summaryOptionsSchema.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid options."));
  }
  const options = parsed.data;

  const content = await deps.contents.get(contentId);
  if (!content) return err(appError("not_found", "This content no longer exists."));
  if (content.status !== "ready") {
    return err(appError("validation", "This content is still being processed. Try again soon."));
  }

  const all = await deps.segments.listByContent(contentId);
  const picked = selectSegments(all, options.ranges);
  if (picked.length === 0) {
    return err(
      appError(
        "validation",
        options.ranges.length > 0
          ? "Nothing in this source falls inside the range you chose. Check the start and end."
          : "This content has no text to summarise.",
      ),
    );
  }
  const context = buildSourceContext(picked);
  if (context.length > MAX_SOURCE_CHARS) {
    return err(
      appError("validation", "This source is too long to summarise at once. Choose a range."),
    );
  }

  const set = await deps.studySets.create({
    kind: "summary",
    contentId,
    spaceId: null,
    title: titleFor(options),
    options: { ...options },
    body: null,
    status: "generating",
  });

  const system = buildSummarySystem({
    template: options.template,
    language: options.language,
    customPrompt: options.customPrompt,
  });

  const run = async (): Promise<void> => {
    try {
      const llm = await deps.llm();
      const flushMs = deps.flushIntervalMs ?? 1000;
      let text = "";
      let lastFlush = Date.now();
      let failure: string | null = null;

      for await (const event of llm.streamText({
        task: "summary",
        system,
        context,
        messages: [{ role: "user", content: summaryUserMessage }],
      })) {
        if (event.type === "text") {
          text += event.delta;
          if (Date.now() - lastFlush >= flushMs) {
            lastFlush = Date.now();
            await deps.studySets.update(set.id, { body: text });
          }
        } else if (event.type === "error") {
          failure = event.message;
        }
      }

      if (failure !== null) {
        await deps.studySets.update(set.id, {
          body: text || null,
          status: "failed",
          error: failure,
        });
      } else if (text.trim() === "") {
        await deps.studySets.update(set.id, {
          status: "failed",
          error: "Claude returned an empty summary. Try again.",
        });
      } else {
        await deps.studySets.update(set.id, { body: text.trim(), status: "ready", error: null });
      }
    } catch (cause) {
      // A bug or an adapter that threw: never leave the set "generating" forever.
      const message = cause instanceof Error ? cause.message : "Something went wrong.";
      await deps.studySets.update(set.id, { status: "failed", error: message });
    }
  };

  return ok({ set, run });
}

/** Convenience for tests and scripts: start, then wait for the run to finish. */
export async function generateSummary(
  deps: SummaryDeps,
  contentId: ContentId,
  input: SummaryOptionsInput,
): Promise<Result<StudySet>> {
  const started = await startSummary(deps, contentId, input);
  if (!started.ok) return started;
  await started.value.run();
  const done = await deps.studySets.get(started.value.set.id);
  return done ? ok(done) : err(appError("not_found", "The summary was deleted."));
}

/** This content's summaries, newest first. Marks interrupted generations as failed. */
export async function listSummaries(
  deps: Pick<SummaryDeps, "studySets" | "now">,
  contentId: ContentId,
): Promise<StudySet[]> {
  const now = (deps.now ?? (() => new Date()))().getTime();
  const sets = await deps.studySets.listByContent(contentId, "summary");
  const out: StudySet[] = [];
  for (const s of sets) {
    if (s.status === "generating" && now - s.updatedAt.getTime() > STALE_GENERATING_MS) {
      const error = "Generation was interrupted. Generate it again.";
      await deps.studySets.update(s.id, { status: "failed", error });
      out.push({ ...s, status: "failed", error });
    } else {
      out.push(s);
    }
  }
  return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function deleteSummary(
  deps: Pick<SummaryDeps, "studySets">,
  contentId: ContentId,
  id: StudySetId,
): Promise<Result<void>> {
  const set = await deps.studySets.get(id);
  if (set?.kind !== "summary" || set.contentId !== contentId) {
    return err(appError("not_found", "That summary no longer exists."));
  }
  await deps.studySets.delete(id);
  return ok(undefined);
}

/** What the dialog needs to show the right range inputs. */
export async function getSourceBounds(
  deps: Pick<SummaryDeps, "segments">,
  contentId: ContentId,
): Promise<SourceBounds> {
  return sourceBounds(await deps.segments.listByContent(contentId));
}
