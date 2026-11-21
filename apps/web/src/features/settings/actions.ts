"use server";

import {
  checkLlmConnection,
  deleteLlmProfile,
  deleteProviderKey,
  saveLlmProfile,
  saveProviderKey,
  updateLlmRoutes,
} from "@thoth/core";
import { refresh } from "next/cache";
import { getContainer } from "@/server/container";

/**
 * Thin adapters from the Settings UI to the LLM settings use cases (doc 20).
 * API keys only travel client → server, into the OS keychain. No action returns a key.
 */
export type ActionResult<T = null> = { ok: true; value: T } | { ok: false; error: string };

export interface ProfileForm {
  id?: string | undefined;
  name: string;
  baseUrl: string;
  models: string[];
  caps?: { jsonSchema: boolean; tools: boolean } | undefined;
  /** Typed in the password field. Empty keeps the saved key. */
  apiKey?: string | undefined;
}

export async function saveProfileAction(form: ProfileForm): Promise<ActionResult<string>> {
  const c = await getContainer();
  const { apiKey, ...profile } = form;
  const saved = await saveLlmProfile({ settings: c.settings }, profile);
  if (!saved.ok) return { ok: false, error: saved.error.message };
  if (apiKey?.trim()) {
    const key = await saveProviderKey(c, saved.value.id, apiKey);
    if (!key.ok) {
      refresh();
      return { ok: false, error: `Provider saved, but not its key: ${key.error.message}` };
    }
  }
  refresh();
  return { ok: true, value: saved.value.id };
}

export async function deleteProfileAction(id: string): Promise<ActionResult> {
  const c = await getContainer();
  const r = await deleteLlmProfile(c, id);
  if (!r.ok) return { ok: false, error: r.error.message };
  refresh();
  return { ok: true, value: null };
}

export async function saveKeyAction(profileId: string, apiKey: string): Promise<ActionResult> {
  const c = await getContainer();
  const r = await saveProviderKey(c, profileId, apiKey);
  if (!r.ok) return { ok: false, error: r.error.message };
  refresh();
  return { ok: true, value: null };
}

export async function deleteKeyAction(profileId: string): Promise<ActionResult> {
  const c = await getContainer();
  const r = await deleteProviderKey(c, profileId);
  if (!r.ok) return { ok: false, error: r.error.message };
  refresh();
  return { ok: true, value: null };
}

export interface TestResult {
  models: string[];
  model: string | null;
  jsonSchema: boolean;
  note: string | null;
}

export async function testProfileAction(input: {
  profileId?: string | undefined;
  name: string;
  baseUrl: string;
  apiKey?: string | undefined;
  model?: string | undefined;
}): Promise<ActionResult<TestResult>> {
  const c = await getContainer();
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    return { ok: false, error: "Enter a full base URL, such as http://localhost:11434/v1." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "The base URL must start with http:// or https://." };
  }
  const r = await c.probeLlm({ ...input, name: input.name || url.host });
  return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error.message };
}

export async function saveRoutesAction(tasks: unknown): Promise<ActionResult> {
  const { settings } = await getContainer();
  const r = await updateLlmRoutes({ settings }, tasks);
  if (!r.ok) return { ok: false, error: r.error.message };
  refresh();
  return { ok: true, value: null };
}

export type CheckState =
  | { status: "idle" }
  | { status: "ok"; provider: string; reply: string; elapsedMs: number }
  | { status: "error"; message: string };

/** Checks the provider the chat task is routed to. */
export async function checkConnectionAction(): Promise<CheckState> {
  const c = await getContainer();
  const r = await checkLlmConnection(await c.llm("chat"));
  return r.ok ? { status: "ok", ...r.value } : { status: "error", message: r.error.message };
}
