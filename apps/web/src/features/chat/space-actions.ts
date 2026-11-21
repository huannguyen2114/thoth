"use server";

import {
  type Chat,
  type ChatId,
  type ChatThread,
  getChatThread,
  listSpaceChats,
  type SpaceId,
  setChatInstructions,
} from "@thoth/core";
import { getContainer } from "@/server/container";

/** Thin adapters for space chat (doc 22). Sending a message is POST /api/spaces/[id]/chat. */

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function listSpaceChatsAction(spaceId: string): Promise<Chat[]> {
  return listSpaceChats(await getContainer(), spaceId as SpaceId);
}

export async function loadSpaceChatAction(
  spaceId: string,
  chatId: string,
): Promise<ActionResult<ChatThread>> {
  const r = await getChatThread(await getContainer(), chatId as ChatId);
  if (!r.ok) return { ok: false, error: r.error.message };
  if (r.value.chat.spaceId !== spaceId) {
    return { ok: false, error: "This chat belongs to another space." };
  }
  return r;
}

export async function saveSpaceChatInstructionsAction(
  chatId: string,
  instructions: string,
): Promise<ActionResult<Chat>> {
  const r = await setChatInstructions(await getContainer(), { chatId, instructions });
  return r.ok ? r : { ok: false, error: r.error.message };
}
