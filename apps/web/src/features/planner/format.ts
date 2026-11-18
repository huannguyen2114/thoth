import type { PlanItem, PlanItemKind, StudyPlan } from "@thoth/core";

export const tzOffset = () => new Date().getTimezoneOffset();

/** Today as a local "YYYY-MM-DD", from the browser's clock. */
export function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const addDaysTo = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const weekdayOf = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay();

/** The Monday on or before `day`. */
export const weekStartOf = (day: string): string => addDaysTo(day, -((weekdayOf(day) + 6) % 7));

export const formatDay = (
  day: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" },
): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

export const kindLabel: Record<PlanItemKind, string> = {
  learn: "Learn",
  quiz: "Quiz",
  review: "Review",
  exam: "Exam",
  rest: "Rest",
};

export const kindBadge: Record<PlanItemKind, string> = {
  learn: "badge--info",
  quiz: "badge--accent",
  review: "badge--success",
  exam: "badge--warning",
  rest: "badge--neutral",
};

/** Where an item leads: the content (Chapters, Quiz), the review queue, or the space's exams. */
export function itemHref(
  item: Pick<PlanItem, "kind" | "contentId">,
  plan: Pick<StudyPlan, "spaceId">,
): string | null {
  switch (item.kind) {
    case "learn":
    case "quiz":
      return item.contentId ? `/content/${item.contentId}` : null;
    case "review":
      return "/review";
    case "exam":
      return plan.spaceId ? `/spaces/${plan.spaceId}` : null;
    case "rest":
      return null;
  }
}

export const itemHint: Record<PlanItemKind, string> = {
  learn: "Open Chapters",
  quiz: "Open Quiz",
  review: "Open Review",
  exam: "Open exams",
  rest: "",
};

export const minutesLabel = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
