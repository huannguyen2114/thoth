import type { Chat, ChatMessage, ChatTurnEvent, SpaceChatTurn } from "@thoth/core";

/** One SSE frame from POST /api/spaces/[id]/chat (doc 22). */
export type SpaceChatStreamEvent =
  | { type: "start"; chat: Chat; userMessage: ChatMessage; context: SpaceChatTurn["context"] }
  | ChatTurnEvent;
