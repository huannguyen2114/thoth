import { startChatTurn } from "@thoth/core";
import type { ChatStreamEvent } from "@/features/chat/stream-events";
import { getContainer } from "@/server/container";

/**
 * POST /api/chat: one chat turn as Server-Sent Events (ADR-0011).
 * Body: { contentId, chatId?, text, instructions? }. Errors before streaming are JSON with a
 * 4xx status; errors while streaming are an `error` event. Rules live in core startChatTurn.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Send the question as JSON." }, { status: 400 });
  }
  const c = await getContainer();
  const turn = await startChatTurn(
    {
      contents: c.contents,
      segments: c.segments,
      chats: c.chats,
      activity: c.activity,
      llm: await c.llm(),
    },
    (body ?? {}) as Parameters<typeof startChatTurn>[1],
    { signal: req.signal },
  );
  if (!turn.ok) {
    const status = turn.error.code === "not_found" ? 404 : 400;
    return Response.json({ error: turn.error.message }, { status });
  }

  const { chat, userMessage, context, events } = turn.value;
  const encoder = new TextEncoder();
  const frame = (e: ChatStreamEvent) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) => {
        try {
          controller.enqueue(frame(e));
        } catch {
          // The client went away; keep consuming so the answer is still saved.
        }
      };
      send({ type: "start", chat, userMessage, context });
      try {
        for await (const e of events) send(e);
      } catch (cause) {
        console.error("chat stream failed", cause);
        send({ type: "error", message: "The answer stopped unexpectedly. Ask again." });
      }
      try {
        controller.close();
      } catch {
        // Already closed by a disconnect.
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
