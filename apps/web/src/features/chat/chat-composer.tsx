"use client";

import { type FormEvent, type KeyboardEvent, useState } from "react";
import type { ChatController } from "./use-chat";

/**
 * Hearth composer at the bottom of the Learn panel ("Ask anything"). Enter sends,
 * Shift+Enter adds a line. While an answer streams, the send button stops it.
 */
export function ChatComposer({
  chat,
  onBeforeSend,
}: {
  chat: ChatController;
  /** Called before sending, e.g. to open the chat tab. */
  onBeforeSend?: () => void;
}) {
  const [text, setText] = useState("");
  const streaming = chat.status === "streaming";

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (streaming) {
      chat.stop();
      return;
    }
    const q = text.trim();
    if (!q) return;
    onBeforeSend?.();
    setText("");
    const sent = await chat.send(q);
    if (!sent) setText(q);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <form onSubmit={submit} className="composer max-w-none">
      <textarea
        className="composer__input max-h-40 resize-none field-sizing-content"
        rows={1}
        placeholder="Ask anything"
        aria-label="Ask a question about this source"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={chat.status === "loading"}
      />
      <button
        type="submit"
        className="composer__send shrink-0"
        aria-label={streaming ? "Stop the answer" : "Send question"}
        disabled={!streaming && !text.trim()}
      >
        {streaming ? <StopIcon /> : <SendIcon />}
      </button>
    </form>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 13V3M3.5 7.5 8 3l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}
