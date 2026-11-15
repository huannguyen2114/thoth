import type { LlmStreamEvent } from "@thoth/core";
import { getContainer } from "@/server/container";

/**
 * POST /api/llm/stream: streams a short reply from the selected provider as Server-Sent Events.
 * Phase 1 uses it for the Settings "test streaming" button; Phase 3 chat reuses the pattern (ADR-0011).
 */
export async function POST(req: Request) {
  const llm = await (await getContainer()).llm();
  const encoder = new TextEncoder();
  const send = (e: LlmStreamEvent) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`);

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const event of llm.streamText({
        task: "chat",
        effort: "low",
        system: "You are Thoth, a calm study companion. Answer in plain prose.",
        messages: [
          { role: "user", content: "In three short sentences, explain what spaced repetition is." },
        ],
        maxTokens: 1024,
        signal: req.signal,
      })) {
        controller.enqueue(send(event));
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
