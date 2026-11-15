"use server";

import {
  type ContentId,
  deleteSummary,
  getSourceBounds,
  listSummaries,
  type SourceBounds,
  type StudySet,
  type StudySetId,
  type SummaryOptionsInput,
  startSummary,
} from "@thoth/core";
import { after } from "next/server";
import { getContainer } from "@/server/container";

/** Plain, serialisable shape the client panel works with. */
export interface SummaryDto {
  id: string;
  title: string;
  status: StudySet["status"];
  error: string | null;
  body: string | null;
  createdAt: number;
}

const toDto = (s: StudySet): SummaryDto => ({
  id: s.id,
  title: s.title,
  status: s.status,
  error: s.error,
  body: s.body,
  createdAt: s.createdAt.getTime(),
});

async function deps() {
  const c = await getContainer();
  return {
    contents: c.contents,
    segments: c.segments,
    studySets: c.studySets,
    activity: c.activity,
    llm: () => c.llm(),
  };
}

export interface SummaryPanelData {
  sets: SummaryDto[];
  bounds: SourceBounds;
}

/** Everything the panel needs on first load. Thin: all rules live in core. */
export async function loadSummaryPanelAction(contentId: string): Promise<SummaryPanelData> {
  const d = await deps();
  const id = contentId as ContentId;
  const [sets, bounds] = await Promise.all([listSummaries(d, id), getSourceBounds(d, id)]);
  return { sets: sets.map(toDto), bounds };
}

/** Polled while a summary is generating. */
export async function listSummariesAction(contentId: string): Promise<SummaryDto[]> {
  return (await listSummaries(await deps(), contentId as ContentId)).map(toDto);
}

export type StartSummaryResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Creates the set and returns at once. The model runs in `after()` and writes into the set,
 * so the panel shows progress by polling (see docs/decision draft for Lane C).
 */
export async function startSummaryAction(
  contentId: string,
  input: SummaryOptionsInput,
): Promise<StartSummaryResult> {
  const started = await startSummary(await deps(), contentId as ContentId, input);
  if (!started.ok) return { ok: false, error: started.error.message };
  after(started.value.run);
  return { ok: true, id: started.value.set.id };
}

export async function deleteSummaryAction(
  contentId: string,
  id: string,
): Promise<{ error: string | null }> {
  const r = await deleteSummary(await deps(), contentId as ContentId, id as StudySetId);
  return { error: r.ok ? null : r.error.message };
}
