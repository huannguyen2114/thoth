import { z } from "zod";
import type { Chat, ChatMessage } from "../../domain/chat";
import { parseLinks } from "../../domain/link";
import type { LinkRepository, SpaceRepository } from "../../ports/repositories";
import type { ChatId, SpaceId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { recordActivity } from "../activity";
import {
  type ChatTurnDeps,
  type ChatTurnEvent,
  HISTORY_LIMIT,
  MAX_INSTRUCTIONS_CHARS,
  MAX_QUESTION_CHARS,
  toLlmMessages,
} from "./chat";
import { chatTitleFrom } from "./prompts";
import { linkSpaceCitations, type SpaceSource } from "./space-chat-citations";
import {
  buildSpaceChatContext,
  defaultSpaceChatContextOptions,
  type SpaceChatContextOptions,
} from "./space-chat-context";
import { buildSpaceChatSystemPrompt } from "./space-chat-prompts";

/**
 * Chat across every ready content in a space (ADR-0039, doc 22). Same shape as content chat
 * (`startChatTurn`): errors before streaming are returned, errors while streaming are events.
 * The saved answer holds `thoth:` links instead of citation tokens, and its links are indexed
 * as `chat_message` backlinks.
 */
export interface SpaceChatDeps extends ChatTurnDeps {
  spaces: SpaceRepository;
  links?: LinkRepository;
}

export const spaceChatTurnInput = z.object({
  spaceId: z.string().min(1, "Choose a space to chat about."),
  chatId: z.string().min(1).optional(),
  text: z
    .string()
    .trim()
    .min(1, "Type a question first.")
    .max(MAX_QUESTION_CHARS, `Shorten your question to under ${MAX_QUESTION_CHARS} characters.`),
  instructions: z
    .string()
    .max(
      MAX_INSTRUCTIONS_CHARS,
      `Keep chat instructions under ${MAX_INSTRUCTIONS_CHARS} characters.`,
    )
    .transform((s) => s.trim() || null)
    .nullable()
    .optional(),
});
export type SpaceChatTurnInput = z.input<typeof spaceChatTurnInput>;

export interface SpaceChatTurn {
  chat: Chat;
  userMessage: ChatMessage;
  context: {
    mode: "full" | "search";
    included: number;
    total: number;
    /** S1..Sn, so the browser can turn `[S2 p.3]` into chips while the answer streams. */
    sources: SpaceSource[];
  };
  events: AsyncIterable<ChatTurnEvent>;
}

export async function startSpaceChatTurn(
  deps: SpaceChatDeps,
  input: SpaceChatTurnInput,
  options: { context?: SpaceChatContextOptions; signal?: AbortSignal; now?: Date } = {},
): Promise<Result<SpaceChatTurn>> {
  const parsed = spaceChatTurnInput.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid question."));
  }
  const spaceId = parsed.data.spaceId as SpaceId;
  const space = await deps.spaces.get(spaceId);
  if (!space) return err(appError("not_found", "This space no longer exists."));

  const ready = (await deps.contents.listBySpace(spaceId)).filter((c) => c.status === "ready");
  if (ready.length === 0) {
    return err(
      appError("validation", "Add a content to this space first, then ask about it here."),
    );
  }

  const chatResult = await findOrCreateSpaceChat(deps, spaceId, parsed.data);
  if (!chatResult.ok) return chatResult;
  const chat = chatResult.value;

  const history = await deps.chats.listMessages(chat.id);
  const lastQuestion = history.findLast((m) => m.role === "user")?.text ?? "";
  const context = await buildSpaceChatContext(
    deps,
    ready,
    `${parsed.data.text} ${lastQuestion}`,
    options.context ?? defaultSpaceChatContextOptions,
  );
  if (context.sources.length === 0) {
    return err(appError("validation", "The contents in this space have no text to ask about yet."));
  }

  const userMessage = await deps.chats.addMessage(chat.id, "user", parsed.data.text, []);
  await recordActivity(deps.activity, "chat_question", userMessage.id, options.now);
  const system = buildSpaceChatSystemPrompt({
    spaceName: space.name,
    mode: context.mode,
    instructions: chat.instructions,
  });
  const messages = toLlmMessages([...history.slice(-HISTORY_LIMIT), userMessage]);

  async function* events(): AsyncIterable<ChatTurnEvent> {
    let answer = "";
    for await (const e of deps.llm.streamText({
      task: "chat",
      system,
      context: context.text,
      messages,
      ...(options.signal ? { signal: options.signal } : {}),
    })) {
      if (e.type === "text") {
        answer += e.delta;
        yield e;
      } else if (e.type === "error") {
        yield { type: "error", message: e.message };
        return;
      }
    }
    const trimmed = answer.trim();
    if (!trimmed) {
      yield { type: "error", message: "The reply came back empty. Ask again." };
      return;
    }
    const linked = linkSpaceCitations(trimmed, context.sources);
    // Citations stay empty: a space answer's places live in its `thoth:` links (ADR-0039).
    const message = await deps.chats.addMessage(chat.id, "assistant", linked, []);
    await indexAnswerLinks(deps.links, spaceId, message);
    yield { type: "saved", message };
  }

  return ok({
    chat,
    userMessage,
    context: {
      mode: context.mode,
      included: context.included,
      total: context.total,
      sources: context.sources,
    },
    events: events(),
  });
}

/** Writes the answer's links to the backlink index, so a content shows "cited in space chat". */
export async function indexAnswerLinks(
  links: LinkRepository | undefined,
  spaceId: SpaceId,
  message: Pick<ChatMessage, "id" | "text">,
): Promise<void> {
  if (!links) return;
  await links.replaceFrom(
    "chat_message",
    message.id,
    parseLinks(message.text).map((l) => ({
      fromKind: "chat_message",
      fromId: message.id,
      fromContentId: null,
      fromSpaceId: spaceId,
      label: l.label,
      anchor: l.anchor,
    })),
  );
}

async function findOrCreateSpaceChat(
  deps: Pick<SpaceChatDeps, "chats">,
  spaceId: SpaceId,
  input: { chatId?: string | undefined; text: string; instructions?: string | null | undefined },
): Promise<Result<Chat>> {
  if (input.chatId) {
    const chat = await deps.chats.get(input.chatId as ChatId);
    if (!chat || chat.spaceId !== spaceId) {
      return err(appError("not_found", "This chat no longer exists. Start a new chat."));
    }
    return ok(chat);
  }
  const instructions =
    input.instructions !== undefined
      ? input.instructions
      : ((await deps.chats.listBySpace(spaceId))[0]?.instructions ?? null);
  const chat = await deps.chats.createForSpace(spaceId, chatTitleFrom(input.text));
  if (instructions) await deps.chats.setInstructions(chat.id, instructions);
  return ok({ ...chat, instructions });
}

export function listSpaceChats(deps: Pick<SpaceChatDeps, "chats">, spaceId: SpaceId) {
  return deps.chats.listBySpace(spaceId);
}
