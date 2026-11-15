"use server";

import {
  type Chat,
  type ChatId,
  type ChatThread,
  type ContentId,
  getChatThread,
  listChats,
  setChatInstructions,
} from "@thoth/core";
import { getContainer } from "@/server/container";

/** Thin adapters over the chat use cases (ADR-0011). Sending a message is POST /api/chat. */

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function listChatsAction(contentId: string): Promise<Chat[]> {
  return listChats(await getContainer(), contentId as ContentId);
}

export async function loadChatAction(chatId: string): Promise<ActionResult<ChatThread>> {
  const r = await getChatThread(await getContainer(), chatId as ChatId);
  return r.ok ? r : { ok: false, error: r.error.message };
}

export async function saveChatInstructionsAction(
  chatId: string,
  instructions: string,
): Promise<ActionResult<Chat>> {
  const r = await setChatInstructions(await getContainer(), { chatId, instructions });
  return r.ok ? r : { ok: false, error: r.error.message };
}
