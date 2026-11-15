"use server";

import { checkLlmConnection, llmTasks, updateLlmSettings } from "@thoth/core";
import { refresh } from "next/cache";
import { getContainer } from "@/server/container";

export type SaveState = { error: string | null; saved: boolean };

/** Thin adapter: FormData -> updateLlmSettings use case. */
export async function saveLlmSettingsAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  const { settings } = await getContainer();
  const input = {
    provider: form.get("provider"),
    models: Object.fromEntries(llmTasks.map((t) => [t, form.get(`model.${t}`)])),
  };
  const r = await updateLlmSettings({ settings }, input);
  if (!r.ok) return { error: r.error.message, saved: false };
  refresh();
  return { error: null, saved: true };
}

export type CheckState =
  | { status: "idle" }
  | { status: "ok"; provider: string; reply: string; elapsedMs: number }
  | { status: "error"; message: string };

export async function checkConnectionAction(): Promise<CheckState> {
  const c = await getContainer();
  const r = await checkLlmConnection(await c.llm());
  return r.ok ? { status: "ok", ...r.value } : { status: "error", message: r.error.message };
}
