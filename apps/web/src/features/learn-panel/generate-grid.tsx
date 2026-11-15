"use client";

import { useId } from "react";
import type { ChatSummary } from "@/features/chat/use-chat";
import { learnTools } from "./registry";
import type { LearnToolId } from "./types";

/** The Learn tab: the Generate grid (one card per registered tool) and recent chats. */
export function GenerateGrid({
  onOpenTool,
  chats,
  onOpenChat,
}: {
  onOpenTool: (id: LearnToolId) => void;
  chats: ChatSummary[];
  onOpenChat: (id: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-8 p-4">
      <section className="flex flex-col gap-3" aria-labelledby={`${id}-generate`}>
        <h2 id={`${id}-generate`} className="type-overline overline">
          Generate
        </h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {learnTools.map((tool) => (
            <li key={tool.id}>
              <button
                type="button"
                onClick={() => onOpenTool(tool.id)}
                className="flex h-full w-full flex-col gap-1 rounded-lg border border-border-subtle bg-surface-200 p-4 text-left transition-colors hover:bg-surface-300"
              >
                <span className="type-label text-ink">{tool.label}</span>
                <span className="type-caption text-ink-muted">{tool.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {chats.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby={`${id}-chats`}>
          <h2 id={`${id}-chats`} className="type-overline overline">
            Chats
          </h2>
          <ul className="flex flex-col gap-0.5">
            {chats.slice(0, 8).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpenChat(c.id)}
                  title={c.title}
                  className="nav-item w-full text-left"
                >
                  <ChatIcon />
                  <span className="truncate">{c.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11h0A1.5 1.5 0 0 1 3 9.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
