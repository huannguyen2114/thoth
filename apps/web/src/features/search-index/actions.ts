"use server";

import { clearSearchIndex, getSearchIndexStatus } from "@thoth/core";
import { getContainer } from "@/server/container";
import { indexerStatus, wakeIndexer } from "@/server/jobs/indexer";

export interface SearchIndexView {
  enabled: boolean;
  total: number;
  indexed: number;
  /** True while the background indexer is embedding a batch. */
  running: boolean;
  /** The search model's last error, for example offline on first download. */
  error: string | null;
}

/** Thin adapter: counts from the core use case, live state from the in-process indexer. */
export async function loadSearchIndexAction(): Promise<SearchIndexView> {
  const c = await getContainer();
  const s = await getSearchIndexStatus(c);
  const live = indexerStatus();
  return {
    enabled: s.enabled,
    total: s.total,
    indexed: s.indexed,
    running: live.running,
    error: live.lastError,
  };
}

/** Drops every vector and wakes the indexer, which embeds the library again. */
export async function rebuildSearchIndexAction(): Promise<SearchIndexView> {
  await clearSearchIndex(await getContainer());
  wakeIndexer();
  return loadSearchIndexAction();
}
