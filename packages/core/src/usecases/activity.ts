import { type ActivityKind, NOTE_EDIT_THROTTLE_MS } from "../domain/activity";
import type { ActivityRepository } from "../ports/repositories";

/**
 * Records one study event (ADR-0023). Optional dependency: a use case without an activity
 * repository (most tests) records nothing. A failure to record never fails the action.
 */
export async function recordActivity(
  activity: ActivityRepository | undefined,
  kind: ActivityKind,
  ref: string | null,
  at: Date = new Date(),
): Promise<void> {
  if (!activity) return;
  try {
    if (kind === "note_edit" && ref) {
      await activity.recordThrottled(kind, ref, at, NOTE_EDIT_THROTTLE_MS);
    } else {
      await activity.record(kind, ref, at);
    }
  } catch {
    // The habit tracker is a nice-to-have; the study action already succeeded.
  }
}
