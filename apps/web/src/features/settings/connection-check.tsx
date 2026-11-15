"use client";

import { Button } from "@thoth/ui";
import { useState, useTransition } from "react";
import { type CheckState, checkConnectionAction } from "./actions";

/** Two checks: a one-shot reply (Server Action) and a streamed reply (SSE route). */
export function ConnectionCheck() {
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const [checking, startCheck] = useTransition();
  const [streamText, setStreamText] = useState("");
  const [streamState, setStreamState] = useState<"idle" | "streaming" | "done" | "error">("idle");

  async function runStream() {
    setStreamText("");
    setStreamState("streaming");
    try {
      const res = await fetch("/api/llm/stream", { method: "POST" });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.replace(/^data: /, "");
          const event = JSON.parse(data) as { type: string; delta?: string; message?: string };
          if (event.type === "text") setStreamText((t) => t + (event.delta ?? ""));
          if (event.type === "error") {
            setStreamText(event.message ?? "Streaming failed.");
            setStreamState("error");
            return;
          }
        }
      }
      setStreamState("done");
    } catch {
      setStreamText("Streaming failed. Check that the dev server is running.");
      setStreamState("error");
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-heading-3 text-ink">Check the connection</h2>
      <p className="type-caption text-ink-muted">
        Save your settings first. Each check sends one short prompt to the selected provider.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => startCheck(async () => setCheck(await checkConnectionAction()))}
          disabled={checking}
        >
          {checking ? "Checking" : "Check connection"}
        </Button>
        <Button onClick={runStream} disabled={streamState === "streaming"}>
          {streamState === "streaming" ? "Streaming" : "Test streaming"}
        </Button>
      </div>

      {check.status === "ok" && (
        <div className="callout callout--success max-w-none" role="status">
          <p className="m-0">
            <strong>Connected</strong> via {check.provider} in {(check.elapsedMs / 1000).toFixed(1)}
            s. Reply: “{check.reply}”
          </p>
        </div>
      )}
      {check.status === "error" && (
        <div className="callout callout--danger max-w-none" role="alert">
          <p className="m-0">
            <strong>Not connected.</strong> {check.message}
          </p>
        </div>
      )}
      {streamState !== "idle" && (
        <div
          className={
            streamState === "error"
              ? "callout callout--danger max-w-none"
              : "rounded-lg border border-border-subtle bg-surface-200 p-4"
          }
          aria-live="polite"
        >
          <p className="m-0 type-body-lg text-ink">{streamText || "Waiting for the first words"}</p>
        </div>
      )}
    </section>
  );
}
