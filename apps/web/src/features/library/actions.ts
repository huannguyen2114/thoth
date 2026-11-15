"use server";

import { addContent, type ContentId, retryContent } from "@thoth/core";
import { refresh } from "next/cache";
import { getContainer } from "@/server/container";
import { wakeJobRunner } from "@/server/jobs/runner";

export type AddContentState = { error: string | null; addedAt: number | null };

/** Thin adapter: FormData -> addContent -> UI state. Link kind is detected in core. */
export async function addLinkAction(
  _prev: AddContentState,
  form: FormData,
): Promise<AddContentState> {
  const result = await addContent(await getContainer(), {
    kind: "link",
    url: String(form.get("url") ?? ""),
  });
  if (!result.ok) return { error: result.error.message, addedAt: null };
  wakeJobRunner();
  refresh();
  return { error: null, addedAt: Date.now() };
}

export async function addTextAction(
  _prev: AddContentState,
  form: FormData,
): Promise<AddContentState> {
  const result = await addContent(await getContainer(), {
    kind: "text",
    text: String(form.get("text") ?? ""),
  });
  if (!result.ok) return { error: result.error.message, addedAt: null };
  wakeJobRunner();
  refresh();
  return { error: null, addedAt: Date.now() };
}

export async function retryContentAction(form: FormData): Promise<void> {
  const id = String(form.get("contentId") ?? "") as ContentId;
  const result = await retryContent(await getContainer(), id);
  if (result.ok) wakeJobRunner();
  refresh();
}
