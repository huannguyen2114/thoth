"use client";

import type { SourceBounds, SummaryOptionsInput } from "@thoth/core";
import { Button, cx, Dialog } from "@thoth/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { SummaryPassages } from "@/features/annotations/summary-passages";
import type { LearnTool, LearnToolProps } from "@/features/learn-panel/types";
import {
  deleteSummaryAction,
  listSummariesAction,
  loadSummaryPanelAction,
  type SummaryDto,
  startSummaryAction,
} from "./actions";
import { Callout } from "./callout";
import { GenerateSummaryDialog } from "./generate-dialog";
import { Markdown } from "./markdown";

const POLL_MS = 1500;

const statusBadge: Record<SummaryDto["status"], { label: string; className: string }> = {
  generating: { label: "Writing", className: "badge--info" },
  ready: { label: "Ready", className: "badge--success" },
  failed: { label: "Failed", className: "badge--danger" },
};

function SummaryPanel({ contentId, onCite }: LearnToolProps) {
  const [sets, setSets] = useState<SummaryDto[] | null>(null);
  const [bounds, setBounds] = useState<SourceBounds | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState<SummaryDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const openIdRef = useRef(openId);
  openIdRef.current = openId;

  useEffect(() => {
    let cancelled = false;
    loadSummaryPanelAction(contentId)
      .then((data) => {
        if (cancelled) return;
        setSets(data.sets);
        setBounds(data.bounds);
        setOpenId((cur) => cur ?? data.sets[0]?.id ?? null);
      })
      .catch(() => !cancelled && setLoadError("Could not load summaries. Reload the page."));
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  const anyGenerating = sets?.some((s) => s.status === "generating") ?? false;
  useEffect(() => {
    if (!anyGenerating) return;
    const timer = setInterval(() => {
      listSummariesAction(contentId)
        .then(setSets)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [anyGenerating, contentId]);

  const generate = useCallback(
    async (input: SummaryOptionsInput): Promise<string | null> => {
      const r = await startSummaryAction(contentId, input);
      if (!r.ok) return r.error;
      setSets(await listSummariesAction(contentId));
      setOpenId(r.id);
      setGenerating(false);
      return null;
    },
    [contentId],
  );

  async function confirmDelete(set: SummaryDto) {
    const r = await deleteSummaryAction(contentId, set.id);
    setDeleting(null);
    if (r.error) return setLoadError(r.error);
    const next = (await listSummariesAction(contentId)) ?? [];
    setSets(next);
    if (openIdRef.current === set.id) setOpenId(next[0]?.id ?? null);
  }

  if (loadError && !sets) {
    return (
      <Callout variant="danger" title="Summaries did not load">
        {loadError}
      </Callout>
    );
  }
  if (!sets || !bounds) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />;
  }

  const open = sets.find((s) => s.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="type-heading-3 text-ink">Summaries</h3>
        <Button variant="primary" onClick={() => setGenerating(true)}>
          Generate summary
        </Button>
      </div>

      {loadError && (
        <p role="alert" className="type-caption text-danger">
          {loadError}
        </p>
      )}

      {sets.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
          <h4 className="type-heading-3 text-ink">No summaries yet</h4>
          <p className="mt-1 text-ink-muted">
            Generate a detailed summary, a cheat sheet or a short overview of this source.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="My summaries">
          {sets.map((s) => (
            <li
              key={s.id}
              className={cx(
                "flex items-center gap-2 rounded-lg border bg-surface-200 pr-2",
                s.id === openId ? "border-accent" : "border-border-subtle",
              )}
            >
              <button
                type="button"
                aria-current={s.id === openId}
                onClick={() => setOpenId(s.id)}
                className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 p-3 text-left"
              >
                <span className="truncate type-label text-ink">{s.title}</span>
                <span className="flex items-center gap-2 type-caption text-ink-muted">
                  {new Date(s.createdAt).toLocaleString("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  <span className={cx("badge", statusBadge[s.status].className)}>
                    {statusBadge[s.status].label}
                  </span>
                </span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${s.title}`}
                onClick={() => setDeleting(s)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <article className="rounded-lg border border-border-subtle bg-surface-200 p-6">
          <h4 className="mb-2 type-heading-2 text-ink">{open.title}</h4>
          {open.status === "failed" && (
            <Callout variant="danger" title="This summary could not be finished" className="mb-4">
              {open.error ?? "Something went wrong."} Delete it and generate again.
            </Callout>
          )}
          {open.status === "generating" && !open.body && (
            <p className="text-ink-muted" role="status">
              Claude is reading the source and writing. This takes up to a minute.
            </p>
          )}
          {open.body && (
            <SummaryPassages contentId={contentId} setId={open.id} onOpenSet={setOpenId}>
              <Markdown source={open.body} onCite={onCite} />
            </SummaryPassages>
          )}
          {open.status === "generating" && open.body && (
            <p className="type-caption text-ink-muted" role="status">
              Still writing…
            </p>
          )}
        </article>
      )}

      <GenerateSummaryDialog
        open={generating}
        onClose={() => setGenerating(false)}
        bounds={bounds}
        onSubmit={generate}
      />

      {deleting && (
        <Dialog
          onClose={() => setDeleting(null)}
          title="Delete this summary?"
          actions={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void confirmDelete(deleting)}>
                Delete summary
              </Button>
            </>
          }
        >
          <p className="modal__body">“{deleting.title}” will be removed. You cannot undo this.</p>
        </Dialog>
      )}
    </div>
  );
}

export const summaryTool: LearnTool = {
  id: "summary",
  label: "Summary",
  description: "Detailed notes, a cheat sheet or a short overview.",
  Panel: SummaryPanel,
};
