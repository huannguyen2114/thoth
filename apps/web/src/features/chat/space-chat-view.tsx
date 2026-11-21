"use client";

import { Button, cx } from "@thoth/ui";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { InstructionsDialog } from "./instructions-dialog";
import { SpaceRichText } from "./space-rich-text";
import { type SpaceChatController, useSpaceChat } from "./space-use-chat";
import type { ChatSummary } from "./use-chat";

const SUGGESTIONS = [
  "What do these sources have in common?",
  "Where do they disagree?",
  "What should I study first?",
];

/**
 * The space's Chat tab (doc 22): one conversation across every ready content in the space.
 * Every answer cites with chips that open the cited content at the cited page, time or paragraph.
 */
export function SpaceChat({
  spaceId,
  initialChats,
  readyCount,
}: {
  spaceId: string;
  initialChats: ChatSummary[];
  readyCount: number;
}) {
  const chat = useSpaceChat(spaceId, initialChats);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const last = chat.messages.at(-1);

  useEffect(() => {
    if (last) bottom.current?.scrollIntoView({ block: "end" });
  }, [last]);

  return (
    <div className="@container flex h-full min-h-0 flex-col rounded-lg border border-border-subtle bg-surface-200">
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border-subtle py-1.5 pr-2 pl-4 whitespace-nowrap">
        <p
          className="type-label mr-auto hidden min-w-0 flex-1 truncate text-ink @sm:block"
          title={chat.chat?.title}
        >
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
          <Empty readyCount={readyCount} onPick={(q) => void chat.send(q)} />
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
                    <SpaceRichText text={m.text} />
                  ) : (
                    <p className="type-body text-ink-muted">Reading the sources</p>
                  )}
                </div>
              ),
            )}
            {chat.context && chat.status === "idle" && (
              <p className="type-caption text-ink-muted">
                {chat.context.mode === "search"
                  ? `Used the ${chat.context.included} most relevant of ${chat.context.total} passages, from ${chat.context.sources.length} sources.`
                  : `Read ${chat.context.sources.length} ${chat.context.sources.length === 1 ? "source" : "sources"} in full.`}
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

      <div className="shrink-0 border-t border-border-subtle p-3">
        <Composer chat={chat} disabled={readyCount === 0} />
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

function Empty({ readyCount, onPick }: { readyCount: number; onPick: (q: string) => void }) {
  if (readyCount === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-8 text-center">
        <h2 className="type-heading-3 text-ink">Nothing to ask about yet</h2>
        <p className="text-ink-muted">
          Add a lecture or PDF in Contents, then ask across all of it.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-8 text-center">
      <h2 className="type-heading-2 text-ink">Ask across this space</h2>
      <p className="type-body text-ink-muted">
        Answers draw on all {readyCount} {readyCount === 1 ? "source" : "sources"} and cite each
        one. Click a citation to open that source at the spot.
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

function Composer({ chat, disabled }: { chat: SpaceChatController; disabled: boolean }) {
  const [text, setText] = useState("");
  const streaming = chat.status === "streaming";

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (streaming) return chat.stop();
    const q = text.trim();
    if (!q) return;
    setText("");
    if (!(await chat.send(q))) setText(q);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <form onSubmit={submit} className="composer mx-auto max-w-none">
      <textarea
        className="composer__input max-h-40 resize-none field-sizing-content"
        rows={1}
        placeholder="Ask across this space"
        aria-label="Ask a question about this space"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled || chat.status === "loading"}
      />
      <button
        type="submit"
        className="composer__send shrink-0"
        aria-label={streaming ? "Stop the answer" : "Send question"}
        disabled={!streaming && !text.trim()}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          {streaming ? (
            <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
          ) : (
            <path
              d="M8 13V3M3.5 7.5 8 3l4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </button>
    </form>
  );
}

/** Hearth Menu of this space's chats, newest first. */
function HistoryMenu({
  chat,
  open,
  setOpen,
}: {
  chat: SpaceChatController;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { refreshChats } = chat;

  useEffect(() => {
    if (!open) return;
    void refreshChats();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, refreshChats]);

  return (
    <div ref={root} className="relative shrink-0">
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
