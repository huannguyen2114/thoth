"use server";

import { type ContentId, runQuizGeneration, startWeakSpotPractice } from "@thoth/core";
import { after } from "next/server";
import { type ActionResult, toActionResult } from "@/lib/action-result";
import { getContainer } from "@/server/container";

/**
 * "Practice weak spots": starts a focused quiz on that chapter (ADR-0018) and writes the
 * questions after the response (ADR-0016). The quiz appears in the content's Quiz tab.
 */
export async function practiceWeakSpotAction(
  contentId: ContentId,
  topic: string,
): Promise<ActionResult<{ contentId: ContentId }>> {
  const c = await getContainer();
  const r = await startWeakSpotPractice(c, { contentId, topic });
  if (!r.ok) return toActionResult(r);
  const ids = r.value.map((s) => s.id);
  after(async () => {
    for (const id of ids) await runQuizGeneration(c, id);
  });
  return { ok: true, value: { contentId } };
}
