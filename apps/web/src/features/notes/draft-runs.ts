import "server-only";
import { NotesDraftRuns } from "@thoth/core";

const KEY = Symbol.for("thoth.notesDraftRuns");
const store = globalThis as typeof globalThis & { [KEY]?: NotesDraftRuns };

/**
 * The process-wide registry of streamed notes drafts. Kept on `globalThis` so dev hot reloads
 * of this module do not lose a draft that is still running.
 */
export function notesDraftRuns(): NotesDraftRuns {
  store[KEY] ??= new NotesDraftRuns();
  return store[KEY];
}
