"use client";

import { Button, cx } from "@thoth/ui";
import { forwardRef, useState } from "react";
import type { ClaudeRun, RunNotice } from "./use-board";

/**
 * "Ask Claude…", at the bottom of the canvas like Claude's own whiteboard composer. With
 * elements selected, Claude may change those (even your own); otherwise it only adds and
 * changes its own.
 */
export const Composer = forwardRef<
  HTMLTextAreaElement,
  {
    run: ClaudeRun | null;
    notice: RunNotice | null;
    selectedCount: number;
    onAsk: (request: string) => Promise<string | null>;
    onStop: () => void;
    onDismiss: () => void;
  }
>(function Composer({ run, notice, selectedCount, onAsk, onStop, onDismiss }, ref) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const busy = Boolean(run) || sending;

  async function submit() {
    const request = text.trim();
    if (!request || busy) return;
    setSending(true);
    setError(null);
    const e = await onAsk(request);
    setSending(false);
    if (e) setError(e);
    else setText("");
  }

  const status = run
    ? run.phase === "stopping"
      ? "Stopping…"
      : run.kind === "mindmap"
        ? "Claude is mapping the source…"
        : "Claude is drawing…"
    : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
      {(notice || error) && !run && (
        <div
          role={notice?.kind === "error" || error ? "alert" : "status"}
          className={cx(
            "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-hearth-sm",
            notice?.kind === "error" || error
              ? "border-danger-tint bg-danger-tint text-danger"
              : "border-border-subtle bg-surface-200 text-ink",
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 type-label" title={error ?? notice?.text}>
              {error ?? notice?.text}
            </p>
            {notice?.skipped && notice.skipped.length > 0 && (
              <p className="line-clamp-1 type-caption text-ink-muted">
                {notice.skipped.length === 1
                  ? "1 change was left out: "
                  : `${notice.skipped.length} changes were left out: `}
                {notice.skipped.slice(0, 2).join(" ")}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Dismiss"
            onClick={() => {
              setError(null);
              onDismiss();
            }}
          >
            Dismiss
          </Button>
        </div>
      )}
      <form
        className="composer wb-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {status ? (
          <p role="status" className="flex flex-1 items-center gap-2 py-1.5 text-ink-muted">
            <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            {status}
          </p>
        ) : (
          <textarea
            ref={ref}
            rows={1}
            className="composer__input max-h-32 resize-none py-1.5"
            aria-label="Ask Claude to draw or change something"
            placeholder={
              selectedCount > 0
                ? `Ask Claude about the ${selectedCount === 1 ? "selected element" : `${selectedCount} selected elements`}…`
                : "Ask Claude to explain something on the board…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        )}
        {run ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onStop}
            disabled={run.phase === "stopping"}
          >
            Stop
          </Button>
        ) : (
          <button
            type="submit"
            className="composer__send"
            aria-label="Ask Claude"
            disabled={!text.trim() || sending}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
});
