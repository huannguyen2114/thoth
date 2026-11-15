"use client";

import { Button, cx } from "@thoth/ui";
import { useEffect, useRef, useState } from "react";
import { InstructionsDialog } from "./instructions-dialog";
import { RichText } from "./rich-text";
import type { ChatController } from "./use-chat";

const SUGGESTIONS = [
  "Summarise the key ideas",
  "What should I remember for an exam?",
  "Explain the hardest part simply",
];

/** The chat tab: header (history, new chat, instructions) and the Hearth Conversation thread. */
export function ChatView({ chat }: { chat: ChatController }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const last = chat.messages.at(-1);

  // Follow the answer as it streams.
  useEffect(() => {
    if (last) bottom.current?.scrollIntoView({ block: "end" });
  }, [last]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2">
        <p className="type-label min-w-0 flex-1 truncate text-ink" title={chat.chat?.title}>
          {chat.chat?.title ?? "New chat"}
        </p>
        <HistoryMenu chat={chat} open={historyOpen} setOpen={setHistoryOpen} />
        <Button size="sm" variant="ghost" onClick={chat.newChat} disabled={!chat.chat}>
          New chat
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setInstructionsOpen(true)}
          aria-label={chat.instructions ? "Chat instructions (set)" : "Chat instructions"}
        >
          Instructions
          {chat.instructions && <span className="badge badge--accent">On</span>}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6" aria-live="polite">
        {chat.messages.length === 0 && chat.status !== "loading" ? (
          <EmptyChat onPick={(q) => void chat.send(q)} />
        ) : (
          <div className="thread mx-auto">
            {chat.messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="msg--user whitespace-pre-wrap">
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="msg--assistant">
                  {m.text ? (
                    <RichText text={m.text} />
                  ) : (
                    <p className="type-body text-ink-muted">Reading the source</p>
                  )}
                </div>
              ),
            )}
            {chat.context?.mode === "search" && chat.status === "idle" && (
              <p className="type-caption text-ink-muted">
                This source is long, so the answer used the {chat.context.included} most relevant of{" "}
                {chat.context.total} passages.
              </p>
            )}
            {chat.error && (
              <div className="callout callout--danger max-w-none" role="alert">
                <div className="flex flex-col gap-2">
                  <p className="callout__title">No answer this time.</p>
                  <p className="callout__text">{chat.error}</p>
                  <div>
                    <Button size="sm" onClick={chat.retry}>
                      Try again
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div ref={bottom} />
          </div>
        )}
      </div>

      <InstructionsDialog
        open={instructionsOpen}
        initial={chat.instructions}
        isNewChat={!chat.chat}
        onClose={() => setInstructionsOpen(false)}
        onSave={chat.saveInstructions}
      />
    </div>
  );
}

function EmptyChat({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-8 text-center">
      <h2 className="type-heading-2 text-ink">Ask about this source</h2>
      <p className="type-body text-ink-muted">
        Every answer cites the page or moment it comes from. Click a citation to jump there.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((q) => (
          <Button key={q} size="sm" onClick={() => onPick(q)}>
            {q}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Hearth Menu listing this content's chats, newest first. */
function HistoryMenu({
  chat,
  open,
  setOpen,
}: {
  chat: ChatController;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void chat.refreshChats();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, chat.refreshChats]);

  return (
    <div ref={root} className="relative">
      <Button
        size="sm"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        History
      </Button>
      {open && (
        <div
          role="menu"
          className="menu absolute top-full right-0 z-20 mt-1 max-h-80 max-w-xs overflow-y-auto"
        >
          {chat.chats.length === 0 && (
            <p className="type-caption px-3 py-2 text-ink-muted">No earlier chats yet.</p>
          )}
          {chat.chats.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              className={cx("menu__item", c.id === chat.chat?.id && "bg-accent-tint")}
              onClick={() => {
                setOpen(false);
                void chat.openChat(c.id);
              }}
            >
              <span className="truncate">{c.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
