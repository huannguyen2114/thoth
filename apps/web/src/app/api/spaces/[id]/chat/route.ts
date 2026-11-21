import { startSpaceChatTurn } from "@thoth/core";
import type { SpaceChatStreamEvent } from "@/features/chat/space-chat-events";
import { getContainer } from "@/server/container";

/**
 * POST /api/spaces/[id]/chat: one space chat turn as Server-Sent Events (doc 22).
 * Body: { chatId?, text, instructions? }. Same framing as POST /api/chat; the `start` event also
 * carries the sources (S1..Sn) so the browser can show chips while the answer streams.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/spaces/[id]/chat">) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return Response.json({ error: "Send the question as JSON." }, { status: 400 });
  }
  const c = await getContainer();
  const turn = await startSpaceChatTurn(
    {
      spaces: c.spaces,
      contents: c.contents,
      segments: c.segments,
      vectors: c.vectors,
      embeddings: c.embeddings,
      chats: c.chats,
      links: c.links,
      activity: c.activity,
      llm: await c.llm(),
    },
    { ...(body as Parameters<typeof startSpaceChatTurn>[1]), spaceId: id },
    { signal: req.signal },
  );
  if (!turn.ok) {
    const status = turn.error.code === "not_found" ? 404 : 400;
    return Response.json({ error: turn.error.message }, { status });
  }

  const { chat, userMessage, context, events } = turn.value;
  const encoder = new TextEncoder();
  const frame = (e: SpaceChatStreamEvent) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: SpaceChatStreamEvent) => {
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
        console.error("space chat stream failed", cause);
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
