import type { Content } from "../domain/content";
import type { ExamSession } from "../domain/exam";
import { type CreateSpaceInput, createSpaceInput, type Space } from "../domain/space";
import type { StudySet } from "../domain/study-set";
import type {
  ContentRepository,
  ExamSessionRepository,
  SpaceRepository,
  StudySetRepository,
} from "../ports/repositories";
import type { ContentId, SpaceId } from "../shared/id";
import { appError, err, ok, type Result } from "../shared/result";

export interface SpaceDeps {
  spaces: SpaceRepository;
}

/** Validates input at the boundary, then persists. Pattern for every use case. */
export async function createSpace(
  deps: SpaceDeps,
  input: CreateSpaceInput,
): Promise<Result<Space>> {
  const parsed = createSpaceInput.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid input."));
  }
  return ok(await deps.spaces.create(parsed.data));
}

export function listSpaces(deps: SpaceDeps): Promise<Space[]> {
  return deps.spaces.list();
}

export interface SpaceOverview {
  space: Space;
  contents: Content[];
  /** Ready contents not in this space, for the "Add content" picker. */
  available: Content[];
  exams: { set: StudySet; latest: ExamSession | null; best: number | null }[];
}

export async function getSpaceOverview(
  deps: SpaceDeps & {
    contents: ContentRepository;
    studySets: StudySetRepository;
    examSessions: ExamSessionRepository;
  },
  spaceId: SpaceId,
): Promise<Result<SpaceOverview>> {
  const space = await deps.spaces.get(spaceId);
  if (!space) return err(appError("not_found", "This space no longer exists."));
  const [contents, recent, sets] = await Promise.all([
    deps.contents.listBySpace(spaceId),
    deps.contents.listRecent(500),
    deps.studySets.listBySpace(spaceId, "exam"),
  ]);
  const exams = await Promise.all(
    sets.map(async (set) => {
      const sessions = await deps.examSessions.listBySet(set.id);
      const scores = sessions.flatMap((s) => (s.score === null ? [] : [s.score]));
      return { set, latest: sessions[0] ?? null, best: scores.length ? Math.max(...scores) : null };
    }),
  );
  const available = recent.filter((c) => c.spaceId !== spaceId && c.status === "ready");
  return ok({ space, contents, available, exams });
}

/** Moves a content into a space, or out of every space with null. */
export async function moveContentToSpace(
  deps: SpaceDeps & { contents: ContentRepository },
  input: { contentId: ContentId; spaceId: SpaceId | null },
): Promise<Result<void>> {
  const content = await deps.contents.get(input.contentId);
  if (!content) return err(appError("not_found", "This content no longer exists."));
  if (input.spaceId && !(await deps.spaces.get(input.spaceId))) {
    return err(appError("not_found", "This space no longer exists."));
  }
  await deps.contents.setSpace(input.contentId, input.spaceId);
  return ok(undefined);
}
