import type { StudySet } from "../domain/study-set";
import type { StudySetRepository } from "../ports/repositories";

/** A set still `generating` after this long was cut off by a restart (ADR-0016). */
export const STALE_GENERATING_MS = 15 * 60 * 1000;

export const INTERRUPTED_MESSAGE = "Generation was interrupted. Generate it again.";

/**
 * Marks sets left `generating` for longer than STALE_GENERATING_MS as failed, saves that,
 * and returns the list with the new status. Shared by every Learn tool and exams.
 */
export async function failStaleSets(
  studySets: Pick<StudySetRepository, "update">,
  sets: readonly StudySet[],
  now: Date,
): Promise<StudySet[]> {
  const out: StudySet[] = [];
  for (const s of sets) {
    if (s.status === "generating" && now.getTime() - s.updatedAt.getTime() > STALE_GENERATING_MS) {
      await studySets.update(s.id, { status: "failed", error: INTERRUPTED_MESSAGE });
      out.push({ ...s, status: "failed", error: INTERRUPTED_MESSAGE });
    } else {
      out.push(s);
    }
  }
  return out;
}
