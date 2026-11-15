import type { Chat, ChatMessage, ChatTurn, ChatTurnEvent } from "@thoth/core";

/** One SSE frame from POST /api/chat. Dates arrive as ISO strings after JSON. */
export type ChatStreamEvent =
  | { type: "start"; chat: Chat; userMessage: ChatMessage; context: ChatTurn["context"] }
  | ChatTurnEvent;

/** JSON turns Dates into strings; this is the shape the browser actually receives. */
export type Wire<T> = T extends Date
  ? string
  : T extends string | number | boolean | null | undefined
    ? T
    : T extends (infer U)[]
      ? Wire<U>[]
      : T extends object
        ? { [K in keyof T]: Wire<T[K]> }
        : T;

/**
 * Reads `data: {json}\n\n` frames from a fetch body. Yields each parsed event.
 * Shared shape with features/settings/connection-check.tsx.
 */
export async function* readSse<T>(body: NonNullable<Response["body"]>): AsyncIterable<T> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const f of frames) {
      const data = f.replace(/^data: /, "").trim();
      if (data) yield JSON.parse(data) as T;
    }
  }
}

export type WireChat = Wire<Chat>;
export type WireMessage = Wire<ChatMessage>;
