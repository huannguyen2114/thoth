import type { JobId } from "../shared/id";

/** Background work (Phase 2 ingestion). Runner: in-process, single user (ADR-0002). */
export const jobKinds = ["ingest", "embed"] as const;
export type JobKind = (typeof jobKinds)[number];

export interface Job {
  id: JobId;
  kind: JobKind;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  error: string | null;
  runAfter: Date;
  createdAt: Date;
  updatedAt: Date;
}
