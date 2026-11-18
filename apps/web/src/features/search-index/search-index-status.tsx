"use client";

import { Button } from "@thoth/ui";
import { useEffect, useState, useTransition } from "react";
import { loadSearchIndexAction, rebuildSearchIndexAction, type SearchIndexView } from "./actions";

const POLL_MS = 3_000;
const fmt = new Intl.NumberFormat("en-US");

/**
 * "Search index: 1,240 of 1,300 passages ready", with a Rebuild action (ADR-0029).
 * Polls while passages are still being embedded, then stops.
 */
export function SearchIndexStatus() {
  const [view, setView] = useState<SearchIndexView | null>(null);
  const [rebuilding, startRebuild] = useTransition();
  const busy = view?.enabled === true && (view.running || view.indexed < view.total);

  useEffect(() => {
    let cancelled = false;
    void loadSearchIndexAction().then((v) => {
      if (!cancelled) setView(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      void loadSearchIndexAction().then(setView);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [busy]);

  if (view === null) return <div className="h-16 animate-pulse rounded-lg bg-surface-300" />;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-heading-3 text-ink">Search</h2>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="m-0 type-body text-ink" aria-live="polite">
          {view.enabled
            ? `Search index: ${fmt.format(view.indexed)} of ${fmt.format(view.total)} passages ready`
            : "Search matches keywords only."}
        </p>
        {view.enabled && (
          <Button
            onClick={() => startRebuild(async () => setView(await rebuildSearchIndexAction()))}
            disabled={rebuilding}
          >
            {rebuilding ? "Rebuilding" : "Rebuild"}
          </Button>
        )}
      </div>
      <p className="m-0 type-caption text-ink-muted">
        Search and chat also find passages by meaning, in any language, with a model that runs on
        this computer. It is downloaded once (about 135 MB). Until a passage is ready, it is found
        by its words.
      </p>
      {view.error && (
        <div className="callout callout--warning max-w-none" role="status">
          <p className="m-0">
            <strong>Keywords only for now.</strong> {view.error}
          </p>
        </div>
      )}
    </section>
  );
}
