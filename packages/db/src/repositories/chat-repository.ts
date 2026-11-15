import {
  type Chat,
  type ChatId,
  type ChatMessage,
  type ChatRepository,
  type CitationRef,
  type ContentId,
  type MessageId,
  newId,
} from "@thoth/core";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { chatMessages, chats } from "../schema";

const toChat = (r: typeof chats.$inferSelect): Chat => ({
  ...r,
  id: r.id as ChatId,
  contentId: r.contentId as ContentId,
});
const toMessage = (r: typeof chatMessages.$inferSelect): ChatMessage => ({
  ...r,
  id: r.id as MessageId,
  chatId: r.chatId as ChatId,
  citations: r.citations as CitationRef[],
});

export class DrizzleChatRepository implements ChatRepository {
  constructor(private readonly db: Db) {}

  async create(contentId: ContentId, title: string) {
    const [row] = await this.db
      .insert(chats)
      .values({ id: newId<ChatId>(), contentId, title })
      .returning();
    if (!row) throw new Error("Insert into chats returned no row.");
    return toChat(row);
  }

  async get(id: ChatId) {
    const row = await this.db.query.chats.findFirst({ where: eq(chats.id, id) });
    return row ? toChat(row) : null;
  }

  async listByContent(contentId: ContentId) {
    const rows = await this.db
      .select()
      .from(chats)
      .where(eq(chats.contentId, contentId))
      .orderBy(desc(chats.updatedAt));
    return rows.map(toChat);
  }

  async setInstructions(id: ChatId, instructions: string | null) {
    await this.db.update(chats).set({ instructions }).where(eq(chats.id, id));
  }

  async addMessage(
    chatId: ChatId,
    role: ChatMessage["role"],
    text: string,
    citations: CitationRef[],
  ) {
    const [row] = await this.db
      .insert(chatMessages)
      .values({ id: newId<MessageId>(), chatId, role, text, citations })
      .returning();
    if (!row) throw new Error("Insert into chat_messages returned no row.");
    await this.db
      .update(chats)
      .set({ updatedAt: sql`(unixepoch('subsec') * 1000)` })
      .where(eq(chats.id, chatId));
    return toMessage(row);
  }

  async listMessages(chatId: ChatId) {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatId, chatId))
      .orderBy(asc(chatMessages.createdAt));
    return rows.map(toMessage);
  }
}
