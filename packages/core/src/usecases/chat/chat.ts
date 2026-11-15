import { z } from "zod";
import type { Chat, ChatMessage } from "../../domain/chat";
import { parseCitations } from "../../domain/citation";
import type { LlmMessage, LlmProvider } from "../../ports/llm";
import type {
  ChatRepository,
  ContentRepository,
  SegmentRepository,
} from "../../ports/repositories";
import type { ChatId, ContentId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import {
  buildChatContext,
  type ChatContextMode,
  type ChatContextOptions,
  defaultChatContextOptions,
} from "./context";
import { buildChatSystemPrompt, chatTitleFrom } from "./prompts";

export interface ChatDeps {
  contents: ContentRepository;
  segments: SegmentRepository;
  chats: ChatRepository;
}

export interface ChatTurnDeps extends ChatDeps {
  llm: LlmProvider;
}

export const MAX_QUESTION_CHARS = 8_000;
export const MAX_INSTRUCTIONS_CHARS = 2_000;
/** Earlier messages sent with each turn. Older ones are dropped to bound the prompt. */
export const HISTORY_LIMIT = 20;

const instructionsSchema = z
  .string()
  .max(MAX_INSTRUCTIONS_CHARS, `Keep chat instructions under ${MAX_INSTRUCTIONS_CHARS} characters.`)
  .transform((s) => s.trim() || null)
  .nullable();

export const chatTurnInput = z.object({
  contentId: z.string().min(1, "Choose a source to chat about."),
  /** Omit to start a new chat. */
  chatId: z.string().min(1).optional(),
  text: z
    .string()
    .trim()
    .min(1, "Type a question first.")
    .max(MAX_QUESTION_CHARS, `Shorten your question to under ${MAX_QUESTION_CHARS} characters.`),
  /** Instructions for a new chat. When omitted, a new chat copies the latest chat's. */
  instructions: instructionsSchema.optional(),
});
export type ChatTurnInput = z.input<typeof chatTurnInput>;

export type ChatTurnEvent =
  | { type: "text"; delta: string }
  /** The assistant message as saved, with parsed citations. Always the last event on success. */
  | { type: "saved"; message: ChatMessage }
  | { type: "error"; message: string };

export interface ChatTurn {
  chat: Chat;
  userMessage: ChatMessage;
  context: { mode: ChatContextMode; included: number; total: number };
  /** Streams the reply, then saves it. Consume it exactly once. */
  events: AsyncIterable<ChatTurnEvent>;
}

export interface ChatTurnOptions {
  context?: ChatContextOptions;
  signal?: AbortSignal;
}

/**
 * One chat turn: validate, find or create the chat, save the question, build the prompt
 * (citation rules + source context + history), then stream the answer and save it with its
 * parsed citations. Errors before streaming are returned; errors while streaming are events.
 */
export async function startChatTurn(
  deps: ChatTurnDeps,
  input: ChatTurnInput,
  options: ChatTurnOptions = {},
): Promise<Result<ChatTurn>> {
  const parsed = chatTurnInput.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid question."));
  }
  const { text } = parsed.data;
  const contentId = parsed.data.contentId as ContentId;

  const content = await deps.contents.get(contentId);
  if (!content) return err(appError("not_found", "This source no longer exists."));
  if (content.status !== "ready") {
    return err(
      appError("validation", "This source is still being processed. Try again in a moment."),
    );
  }

  const chatResult = await findOrCreateChat(deps.chats, contentId, parsed.data);
  if (!chatResult.ok) return chatResult;
  const chat = chatResult.value;

  const history = await deps.chats.listMessages(chat.id);
  const lastQuestion = history.findLast((m) => m.role === "user")?.text ?? "";
  const context = await buildChatContext(
    deps,
    content,
    `${text} ${lastQuestion}`,
    options.context ?? defaultChatContextOptions,
  );
  if (context.totalSegments === 0) {
    return err(appError("validation", "This source has no text yet, so there is nothing to ask."));
  }

  const userMessage = await deps.chats.addMessage(chat.id, "user", text, []);
  const system = buildChatSystemPrompt({
    kind: content.kind,
    title: content.title,
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
    const citations = parseCitations(trimmed).map((c) => c.ref);
    const message = await deps.chats.addMessage(chat.id, "assistant", trimmed, citations);
    yield { type: "saved", message };
  }

  return ok({
    chat,
    userMessage,
    context: {
      mode: context.mode,
      included: context.segments.length,
      total: context.totalSegments,
    },
    events: events(),
  });
}

async function findOrCreateChat(
  chats: ChatRepository,
  contentId: ContentId,
  input: { chatId?: string | undefined; text: string; instructions?: string | null | undefined },
): Promise<Result<Chat>> {
  if (input.chatId) {
    const chat = await chats.get(input.chatId as ChatId);
    if (!chat || chat.contentId !== contentId) {
      return err(appError("not_found", "This chat no longer exists. Start a new chat."));
    }
    return ok(chat);
  }
  const instructions =
    input.instructions !== undefined
      ? input.instructions
      : ((await chats.listByContent(contentId))[0]?.instructions ?? null);
  const chat = await chats.create(contentId, chatTitleFrom(input.text));
  if (instructions) await chats.setInstructions(chat.id, instructions);
  return ok({ ...chat, instructions });
}

/** History as LLM messages. Consecutive turns of one role (e.g. after a failed reply) merge. */
export function toLlmMessages(messages: Pick<ChatMessage, "role" | "text">[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const m of messages) {
    const prev = out.at(-1);
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n\n${m.text}`;
    else out.push({ role: m.role, content: m.text });
  }
  return out;
}

export function listChats(deps: Pick<ChatDeps, "chats">, contentId: ContentId): Promise<Chat[]> {
  return deps.chats.listByContent(contentId);
}

export interface ChatThread {
  chat: Chat;
  messages: ChatMessage[];
}

export async function getChatThread(
  deps: Pick<ChatDeps, "chats">,
  chatId: ChatId,
): Promise<Result<ChatThread>> {
  const chat = await deps.chats.get(chatId);
  if (!chat) return err(appError("not_found", "This chat no longer exists. Start a new chat."));
  return ok({ chat, messages: await deps.chats.listMessages(chatId) });
}

export const setChatInstructionsInput = z.object({
  chatId: z.string().min(1),
  instructions: instructionsSchema,
});

export async function setChatInstructions(
  deps: Pick<ChatDeps, "chats">,
  input: z.input<typeof setChatInstructionsInput>,
): Promise<Result<Chat>> {
  const parsed = setChatInstructionsInput.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid instructions."));
  }
  const id = parsed.data.chatId as ChatId;
  const chat = await deps.chats.get(id);
  if (!chat) return err(appError("not_found", "This chat no longer exists. Start a new chat."));
  await deps.chats.setInstructions(id, parsed.data.instructions);
  return ok({ ...chat, instructions: parsed.data.instructions });
}
