import type { Result } from "@thoth/core";

/** What a Server Action hands to the client: plain data or a sentence the owner can act on. */
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function toActionResult<T>(r: Result<T>): ActionResult<T> {
  return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error.message };
}
