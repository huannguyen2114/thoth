import type { ContentId, SpaceId, StudySetId } from "../shared/id";

/** Anything generated and listed under "My Sets" (YouLearn). */
export const studySetKinds = ["summary", "quiz", "flashcards", "exam"] as const;
export type StudySetKind = (typeof studySetKinds)[number];

export interface StudySet {
  id: StudySetId;
  kind: StudySetKind;
  /** Exactly one of contentId / spaceId is set (exams belong to a space). */
  contentId: ContentId | null;
  spaceId: SpaceId | null;
  title: string;
  /** Generator options as chosen in its dialog (template, difficulty, topics...). Opaque JSON. */
  options: Record<string, unknown>;
  /** Markdown body for summaries; null for quiz and flashcard sets (their items live in tables). */
  body: string | null;
  status: "generating" | "ready" | "failed";
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewStudySet = Pick<StudySet, "kind" | "contentId" | "spaceId" | "title" | "options"> & {
  body?: string | null;
  status?: StudySet["status"];
};
