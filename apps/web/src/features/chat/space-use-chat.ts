"use client";

import { linkSpaceCitations, type SpaceChatTurn } from "@thoth/core";
import { useCallback, useRef, useState } from "react";
import {
  listSpaceChatsAction,
  loadSpaceChatAction,
  saveSpaceChatInstructionsAction,
} from "./space-actions";
import type { SpaceChatStreamEvent } from "./space-chat-events";
import { readSse } from "./stream-events";
import type { ChatStatus, ChatSummary, UiMessage } from "./use-chat";

/**
 * Client state for a space's chat (doc 22): like `useChat`, but posts to the space route, and
 * while an answer streams it shows `[S2 p.3]` citations as chips already, using the sources the
 * `start` event sent. The saved message replaces the streamed text with the stored links.
 */
export function useSpaceChat(spaceId: string, initialChats: ChatSummary[]) {
  const [chats, setChats] = useState<ChatSummary[]>(initialChats);
  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [draftInstructions, setDraftInstructions] = useState<string | null>(
    initialChats[0]?.instructions ?? null,
  );
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<SpaceChatTurn["context"] | null>(null);
  const abort = useRef<AbortController | null>(null);
  const lastQuestion = useRef("");

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
      let sources: SpaceChatTurn["context"]["sources"] = [];
      let streamed = "";

      const dropAnswer = () => setMessages((m) => m.filter((x) => x.id !== tempAnswer));
      try {
        const res = await fetch(`/api/spaces/${spaceId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
        for await (const e of readSse<SpaceChatStreamEvent>(res.body)) {
          if (e.type === "start") {
            const summary = { id: e.chat.id, title: e.chat.title, instructions: e.chat.instructions };
            setChat(summary);
            setChats((list) => [summary, ...list.filter((c) => c.id !== summary.id)]);
            setContext(e.context);
            sources = e.context.sources;
            setMessages((m) =>
              m.map((x) => (x.id === tempUser ? { ...x, id: e.userMessage.id } : x)),
            );
          } else if (e.type === "text") {
            streamed += e.delta;
            const shown = linkSpaceCitations(streamed, sources);
            setMessages((m) => m.map((x) => (x.id === tempAnswer ? { ...x, text: shown } : x)));
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
    [chat, spaceId, draftInstructions, status],
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

  const openChat = useCallback(
    async (id: string) => {
      abort.current?.abort();
      setStatus("loading");
      setError(null);
      const r = await loadSpaceChatAction(spaceId, id);
      setStatus("idle");
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const c = r.value.chat;
      setChat({ id: c.id, title: c.title, instructions: c.instructions });
      setContext(null);
      setMessages(r.value.messages.map((m) => ({ id: m.id, role: m.role, text: m.text })));
    },
    [spaceId],
  );

  const refreshChats = useCallback(async () => {
    setChats(
      (await listSpaceChatsAction(spaceId)).map((c) => ({
        id: c.id,
        title: c.title,
        instructions: c.instructions,
      })),
    );
  }, [spaceId]);

  const saveInstructions = useCallback(
    async (value: string): Promise<string | null> => {
      if (!chat) {
        setDraftInstructions(value.trim() || null);
        return null;
      }
      const r = await saveSpaceChatInstructionsAction(chat.id, value);
      if (!r.ok) return r.error;
      const summary = { id: r.value.id, title: r.value.title, instructions: r.value.instructions };
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

export type SpaceChatController = ReturnType<typeof useSpaceChat>;
