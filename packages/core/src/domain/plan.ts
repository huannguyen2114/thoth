import { z } from "zod";
import type { ContentId, PlanId, PlanItemId, SpaceId } from "../shared/id";

/** Study planner (ADR-0030). */
export const planItemKinds = ["learn", "quiz", "review", "exam", "rest"] as const;
export type PlanItemKind = (typeof planItemKinds)[number];

export const planInputSchema = z.object({
  title: z.string().trim().min(1, "Give the plan a name.").max(120),
  /** Local calendar day "YYYY-MM-DD" of the exam or goal. */
  goalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a goal date."),
  minutesPerDay: z.number().int().min(10, "Plan at least 10 minutes a day.").max(600),
  /** 0 = Sunday … 6 = Saturday. */
  studyDays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one study day."),
  spaceId: z.string().nullable().default(null),
  contentIds: z.array(z.string().min(1)).min(1, "Pick at least one content."),
});
export type PlanInput = z.input<typeof planInputSchema>;

export interface StudyPlan {
  id: PlanId;
  title: string;
  goalDate: string;
  minutesPerDay: number;
  studyDays: number[];
  spaceId: SpaceId | null;
  contentIds: ContentId[];
  createdAt: Date;
  updatedAt: Date;
}
export type NewStudyPlan = Omit<StudyPlan, "id" | "createdAt" | "updatedAt">;

export interface PlanItem {
  id: PlanItemId;
  planId: PlanId;
  /** Local calendar day "YYYY-MM-DD". */
  day: string;
  /** Order within the day. */
  idx: number;
  kind: PlanItemKind;
  title: string;
  minutes: number;
  contentId: ContentId | null;
  /** Chapter title for learn and quiz items. */
  topic: string | null;
  doneAt: Date | null;
}
export type NewPlanItem = Omit<PlanItem, "id" | "planId" | "doneAt">;
