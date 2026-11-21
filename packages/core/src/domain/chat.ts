import type { ChatId, ContentId, MessageId, SpaceId } from "../shared/id";
import type { CitationRef } from "./citation";

/** One conversation about one content (Phase 3) or across a space (Phase 10). */
export interface Chat {
  id: ChatId;
  /** Exactly one of contentId and spaceId is set. */
  contentId: ContentId | null;
  spaceId: SpaceId | null;
  title: string;
  /** Owner's custom chat instructions (YouLearn "Chat instructions"). */
  instructions: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: MessageId;
  chatId: ChatId;
  role: "user" | "assistant";
  text: string;
  /** Parsed from the assistant text when saved; empty for user messages. */
  citations: CitationRef[];
  createdAt: Date;
}
