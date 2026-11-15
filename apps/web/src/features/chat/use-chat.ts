"use client";

import type { Chat, ChatTurn } from "@thoth/core";
import { useCallback, useRef, useState } from "react";
import { listChatsAction, loadChatAction, saveChatInstructionsAction } from "./actions";
import { type ChatStreamEvent, readSse } from "./stream-events";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** True while the answer is still streaming. */
  streaming?: boolean;
}

export interface ChatSummary {
  id: string;
  title: string;
  instructions: string | null;
}

export type ChatStatus = "idle" | "loading" | "streaming";

const toSummary = (c: Pick<Chat, "id" | "title" | "instructions">): ChatSummary => ({
  id: c.id,
  title: c.title,
  instructions: c.instructions,
});

/**
 * Client state for one content's chat: the open chat, its messages, the chat list, and the
 * streaming turn. A new chat has no id until its first question is saved by POST /api/chat.
 */
export function useChat(contentId: string, initialChats: ChatSummary[]) {
  const [chats, setChats] = useState<ChatSummary[]>(initialChats);
  const [chat, setChat] = useState<ChatSummary | null>(null);
  /** Instructions typed before a new chat exists; sent with its first question. */
  const [draftInstructions, setDraftInstructions] = useState<string | null>(
    initialChats[0]?.instructions ?? null,
  );
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ChatTurn["context"] | null>(null);
  const abort = useRef<AbortController | null>(null);
  const lastQuestion = useRef<string>("");

  const instructions = chat ? chat.instructions : draftInstructions;

  const send = useCallback(
    async (raw: string): Promise<boolean> => {
      const text = raw.trim();
      if (!text || status !== "idle") return false;
      lastQuestion.current = text;
      setError(null);
      const tempUser = `pending-user-${Date.now()}`;
      const tempAnswer = `pending-answer-${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: tempUser, role: "user", text },
        { id: tempAnswer, role: "assistant", text: "", streaming: true },
      ]);
      setStatus("streaming");
      const controller = new AbortController();
      abort.current = controller;

      const dropAnswer = () => setMessages((m) => m.filter((x) => x.id !== tempAnswer));
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentId,
            ...(chat ? { chatId: chat.id } : { instructions: draftInstructions ?? null }),
            text,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setMessages((m) => m.filter((x) => x.id !== tempUser && x.id !== tempAnswer));
          setError(body?.error ?? "The question was not sent. Try again.");
          return false;
        }
        for await (const e of readSse<ChatStreamEvent>(res.body)) {
          if (e.type === "start") {
            const summary = toSummary(e.chat);
            setChat(summary);
            setChats((list) => [summary, ...list.filter((c) => c.id !== summary.id)]);
            setContext(e.context);
            setMessages((m) =>
              m.map((x) => (x.id === tempUser ? { ...x, id: e.userMessage.id } : x)),
            );
          } else if (e.type === "text") {
            setMessages((m) =>
              m.map((x) => (x.id === tempAnswer ? { ...x, text: x.text + e.delta } : x)),
            );
          } else if (e.type === "saved") {
            setMessages((m) =>
              m.map((x) =>
                x.id === tempAnswer
                  ? { id: e.message.id, role: "assistant", text: e.message.text }
                  : x,
              ),
            );
          } else if (e.type === "error") {
            dropAnswer();
            setError(e.message);
          }
        }
        return true;
      } catch (cause) {
        if (controller.signal.aborted) {
          // Stopped by the reader: keep what arrived.
          setMessages((m) =>
            m.flatMap((x) =>
              x.id === tempAnswer ? (x.text ? [{ ...x, streaming: false }] : []) : [x],
            ),
          );
          return true;
        }
        console.error(cause);
        dropAnswer();
        setError("The connection dropped. Check that Thoth is running, then try again.");
        return true;
      } finally {
        abort.current = null;
        setStatus("idle");
        setMessages((m) => m.map((x) => (x.streaming ? { ...x, streaming: false } : x)));
      }
    },
    [chat, contentId, draftInstructions, status],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const retry = useCallback(() => {
    if (lastQuestion.current) void send(lastQuestion.current);
  }, [send]);

  const newChat = useCallback(() => {
    abort.current?.abort();
    setChat(null);
    setMessages([]);
    setError(null);
    setContext(null);
    setDraftInstructions(chats[0]?.instructions ?? draftInstructions);
  }, [chats, draftInstructions]);

  const openChat = useCallback(async (id: string) => {
    abort.current?.abort();
    setStatus("loading");
    setError(null);
    const r = await loadChatAction(id);
    setStatus("idle");
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setChat(toSummary(r.value.chat));
    setContext(null);
    setMessages(r.value.messages.map((m) => ({ id: m.id, role: m.role, text: m.text })));
  }, []);

  const refreshChats = useCallback(async () => {
    setChats((await listChatsAction(contentId)).map(toSummary));
  }, [contentId]);

  const saveInstructions = useCallback(
    async (value: string): Promise<string | null> => {
      if (!chat) {
        setDraftInstructions(value.trim() || null);
        return null;
      }
      const r = await saveChatInstructionsAction(chat.id, value);
      if (!r.ok) return r.error;
      const summary = toSummary(r.value);
      setChat(summary);
      setChats((list) => list.map((c) => (c.id === summary.id ? summary : c)));
      return null;
    },
    [chat],
  );

  return {
    chats,
    chat,
    messages,
    status,
    error,
    context,
    instructions,
    send,
    stop,
    retry,
    newChat,
    openChat,
    refreshChats,
    saveInstructions,
  };
}

export type ChatController = ReturnType<typeof useChat>;
