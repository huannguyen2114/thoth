"use client";

import type { SourcePlace } from "@thoth/core";
import { CancelButton, cx, Dialog } from "@thoth/ui";
import { useEffect, useMemo, useState } from "react";
import { sourceAnchorsAction } from "./actions";

/** "Link to source…": pick a chapter, page, time or paragraph for the selected elements. */
export function SourcePicker({
  contentId,
  current,
  onPick,
  onClose,
}: {
  contentId: string;
  current: string | null;
  onPick: (token: string) => void;
  onClose: () => void;
}) {
  const [anchors, setAnchors] = useState<SourcePlace[] | null>(null);
  const [query, setQuery] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    sourceAnchorsAction(contentId)
      .then((a) => !cancelled && setAnchors(a))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!anchors) return [];
    if (!q) return anchors;
    return anchors.filter(
      (a) => a.label.toLowerCase().includes(q) || a.preview.toLowerCase().includes(q),
    );
  }, [anchors, query]);

  return (
    <Dialog title="Link to source" onClose={onClose} actions={<CancelButton onClick={onClose} />}>
      <label className="field">
        <span className="field__label">Find a page, time or words</span>
        <input
          className="field__input"
          value={query}
          autoFocus
          placeholder="For example: page 3, or Krebs"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {failed ? (
        <p className="type-caption text-danger" role="alert">
          The source did not load. Close this and try again.
        </p>
      ) : !anchors ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <div className="h-9 animate-pulse rounded-md bg-surface-300" />
          <div className="h-9 animate-pulse rounded-md bg-surface-300" />
        </div>
      ) : (
        <ul
          className="-mx-2 flex max-h-80 flex-col overflow-y-auto"
          aria-label="Places in the source"
        >
          {shown.length === 0 && <li className="px-2 py-2 text-ink-muted">Nothing matches.</li>}
          {shown.map((a) => (
            <li key={`${a.chapter ? "c" : "s"}${a.token}`}>
              <button
                type="button"
                onClick={() => onPick(a.token)}
                className={cx(
                  "flex w-full cursor-default items-baseline gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-300",
                  a.token === current && "bg-accent-tint",
                )}
              >
                <span className="badge badge--accent shrink-0">{a.token.slice(1, -1)}</span>
                <span
                  className={cx(
                    "min-w-0 flex-1 truncate",
                    a.chapter ? "type-label text-ink" : "text-ink-muted",
                  )}
                >
                  {a.preview}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
