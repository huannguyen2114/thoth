import type { NewPlanItem, PlanItem, PlanItemKind } from "../../domain/plan";
import type { ContentId } from "../../shared/id";
import { addDays, weekdayOf } from "../insights/days";

/**
 * The study scheduler (ADR-0030): a pure, deterministic function of its input. No clock, no
 * randomness, no model. Days are local calendar days "YYYY-MM-DD" (ADR-0023); the caller says
 * which day "today" is. See docs/technical_design/17-study-planner.md for the steps.
 */

export interface PlanChapter {
  contentId: ContentId;
  contentTitle: string;
  /** Chapter title, which is also the quiz topic. */
  title: string;
  /** Characters of source text in the chapter. */
  chars: number;
}

export interface WeakTopic {
  contentId: ContentId;
  topic: string;
  /** 0..1, lower is weaker. */
  score: number;
}

export interface BuildPlanInput {
  /** The first day work may be scheduled on. */
  today: string;
  goalDate: string;
  minutesPerDay: number;
  /** 0 = Sunday … 6 = Saturday. */
  studyDays: readonly number[];
  chapters: readonly PlanChapter[];
  weak: readonly WeakTopic[];
  /** Flashcards that fall due on each day; cards already overdue count on `today`. */
  cardsDue: Readonly<Record<string, number>>;
  /** Finished items to keep when re-planning: they use up time and are not scheduled again. */
  done: readonly PlanItem[];
}

export interface Shortfall {
  /** Mandatory work that did not fit before the goal. */
  unscheduled: { title: string; minutes: number }[];
  missingMinutes: number;
  /** The smallest daily budget (steps of 5) that fits everything, or null if none does. */
  suggestedMinutesPerDay: number | null;
  message: string;
}

export interface BuiltPlan {
  items: NewPlanItem[];
  /** Null when everything fits. */
  shortfall: Shortfall | null;
}

export const CHARS_PER_MINUTE = 800;
export const MIN_LEARN_MINUTES = 5;
export const MAX_LEARN_MINUTES = 40;
export const QUIZ_MINUTES = 8;
export const RETRY_QUIZ_MINUTES = 6;
export const EXAM_MINUTES = 45;
/** Review time per due card, in seconds, and the most one review block may take. */
export const SECONDS_PER_CARD = 30;
export const MAX_REVIEW_MINUTES = 20;
/** A quiz comes this many study days after its chapter, and a weak topic's retry this many after the quiz. */
const QUIZ_GAP = 1;
const RETRY_GAP = 3;
/** Non-weak quizzes take at most this share of a day while chapters are still waiting to be learned. */
const QUIZ_SHARE = 0.5;
/** The daily pace is the work spread over the days available, times this, so the last days stay light. */
const PACE_SLACK = 1.3;
const MAX_HORIZON_DAYS = 400;
const MAX_MINUTES_PER_DAY = 600;

/** Minutes to learn a chapter of `chars` characters. */
export const learnMinutes = (chars: number): number =>
  Math.min(MAX_LEARN_MINUTES, Math.max(MIN_LEARN_MINUTES, Math.ceil(chars / CHARS_PER_MINUTE)));

const kindOrder: Record<PlanItemKind, number> = { review: 0, learn: 1, quiz: 2, exam: 3, rest: 4 };

interface Task {
  seq: number;
  kind: "learn" | "quiz" | "exam";
  title: string;
  minutes: number;
  contentId: ContentId | null;
  topic: string | null;
  /** Weak-topic work goes first. */
  weak: boolean;
  /** Optional work is dropped silently when there is no room. */
  optional: boolean;
  /** Earlier study-day index this task may not be placed before, relative to another task. */
  after?: { task: Task; gap: number };
  /** First study-day index it may use (a quiz after a learn item that is already done). */
  minIdx?: number;
  /** Last study-day index it may use. */
  maxIdx: number;
  placedIdx?: number;
}

/** Builds the schedule, or reports what does not fit and the daily budget that would. */
export function buildPlan(input: BuildPlanInput): BuiltPlan {
  const first = schedule(input);
  if (first.unscheduled.length === 0) return { items: first.items, shortfall: null };

  let suggested: number | null = null;
  for (let m = input.minutesPerDay + 5; m <= MAX_MINUTES_PER_DAY; m += 5) {
    if (schedule({ ...input, minutesPerDay: m }).unscheduled.length === 0) {
      suggested = m;
      break;
    }
  }
  const missing = first.unscheduled.reduce((n, t) => n + t.minutes, 0);
  const advice =
    suggested === null
      ? "Move the goal date later or choose fewer contents."
      : `Try ${suggested} minutes a day, or move the goal date later.`;
  return {
    items: first.items,
    shortfall: {
      unscheduled: first.unscheduled,
      missingMinutes: missing,
      suggestedMinutesPerDay: suggested,
      message: `Not enough time: ${missing} minutes of work do not fit before ${input.goalDate} at ${input.minutesPerDay} minutes a day. ${advice}`,
    },
  };
}

function schedule(input: BuildPlanInput): {
  items: NewPlanItem[];
  unscheduled: { title: string; minutes: number }[];
} {
  const { today, goalDate, minutesPerDay: mpd } = input;
  const restDay = addDays(goalDate, -1);
  const lastWorkDay = addDays(goalDate, -2);

  // 1. Study days: today up to two days before the goal, on the chosen weekdays.
  const days: string[] = [];
  for (let d = today, n = 0; d <= lastWorkDay && n < MAX_HORIZON_DAYS; d = addDays(d, 1), n++) {
    if (input.studyDays.includes(weekdayOf(d))) days.push(d);
  }
  const used = new Map<string, number>();
  for (const it of input.done) used.set(it.day, (used.get(it.day) ?? 0) + it.minutes);
  const free = days.map((d) => Math.max(0, mpd - (used.get(d) ?? 0)));
  const out: { dayIdx: number; kind: PlanItemKind; seq: number; item: Omit<NewPlanItem, "idx"> }[] =
    [];
  let seq = 0;
  const put = (
    dayIdx: number,
    kind: PlanItemKind,
    item: Omit<NewPlanItem, "idx" | "day" | "kind">,
    day = days[dayIdx] as string,
  ) => {
    out.push({ dayIdx, kind, seq: seq++, item: { ...item, day, kind } });
  };

  const doneKinds = (kind: PlanItemKind) => input.done.filter((i) => i.kind === kind);

  // 2. The mock exam: two or three days before the goal, reserved before anything else.
  const unscheduled: { title: string; minutes: number }[] = [];
  let examIdx = -1;
  if (doneKinds("exam").length === 0) {
    // Three days out is preferred, so there is a day to fix what the exam showed; else two.
    examIdx = days.indexOf(addDays(goalDate, -3));
    if (examIdx < 0) examIdx = days.indexOf(addDays(goalDate, -2));
    if (examIdx < 0) examIdx = days.length - 1;
    const minutes = Math.min(EXAM_MINUTES, mpd);
    if (examIdx < 0 || (free[examIdx] ?? 0) < minutes) {
      unscheduled.push({ title: "Mock exam", minutes });
      examIdx = -1;
    } else {
      free[examIdx] = (free[examIdx] ?? 0) - minutes;
      put(examIdx, "exam", { title: "Mock exam", minutes, contentId: null, topic: null });
    }
  }

  // 3. Daily review: due cards roll forward to the next study day, in one capped block.
  let carry = 0;
  for (let d = today, n = 0; d <= lastWorkDay && n < MAX_HORIZON_DAYS; d = addDays(d, 1), n++) {
    carry += input.cardsDue[d] ?? 0;
    const i = days.indexOf(d);
    if (i < 0 || carry <= 0) continue;
    if (input.done.some((x) => x.kind === "review" && x.day === d)) {
      carry = 0;
      continue;
    }
    const wanted = Math.max(
      MIN_LEARN_MINUTES,
      Math.min(MAX_REVIEW_MINUTES, Math.ceil((carry * SECONDS_PER_CARD) / 60)),
    );
    const minutes = Math.min(wanted, free[i] ?? 0);
    if (minutes >= 1) {
      free[i] = (free[i] ?? 0) - minutes;
      put(i, "review", {
        title: `Review ${carry} flashcard${carry === 1 ? "" : "s"}`,
        minutes,
        contentId: null,
        topic: null,
      });
      carry = 0;
    }
  }

  // Quizzes may use the exam day only if the exam left room for one; a chapter has to be learned a
  // study day before its quiz, so learning ends one day earlier.
  const examDayFull = examIdx >= 0 && (free[examIdx] ?? 0) < Math.min(QUIZ_MINUTES, mpd);
  const quizLimit = Math.max(0, (examIdx >= 0 ? examIdx : days.length - 1) - (examDayFull ? 1 : 0));
  const learnLimit = Math.max(0, quizLimit - QUIZ_GAP);

  // 4. Chapters: learn each one, quiz it a study day later, retry weak topics.
  const weakKey = (c: ContentId, t: string) => `${c}::${t}`;
  const weakScore = new Map(input.weak.map((w) => [weakKey(w.contentId, w.topic), w.score]));
  const ordered = input.chapters
    .map((c, i) => ({ c, i, w: weakScore.get(weakKey(c.contentId, c.title)) }))
    .sort((a, b) => {
      const aw = a.w !== undefined;
      const bw = b.w !== undefined;
      if (aw !== bw) return aw ? -1 : 1;
      if (aw && bw && a.w !== b.w) return (a.w as number) - (b.w as number);
      return a.i - b.i;
    });

  const tasks: Task[] = [];
  const lastIdx = days.length - 1;
  for (const { c, w } of ordered) {
    const weak = w !== undefined;
    const base = { contentId: c.contentId, topic: c.title, weak };
    const doneLearns = input.done.filter(
      (i) => i.kind === "learn" && i.contentId === c.contentId && i.topic === c.title,
    );
    const doneLearn = doneLearns.reduce((n, i) => n + i.minutes, 0);
    const lastDoneLearnDay = doneLearns
      .map((i) => i.day)
      .sort()
      .at(-1);
    const remaining = learnMinutes(c.chars) - doneLearn;
    let previous: Task | undefined;
    if (remaining > 0) {
      const parts = Math.ceil(remaining / mpd);
      const each = Math.ceil(remaining / parts);
      for (let p = 0; p < parts; p++) {
        const t: Task = {
          ...base,
          seq: tasks.length,
          kind: "learn",
          title: `Learn: ${c.title}${parts > 1 ? ` (${p + 1}/${parts})` : ""}`,
          minutes: Math.min(each, remaining - each * p),
          optional: false,
          maxIdx: learnLimit,
          ...(previous ? { after: { task: previous, gap: 1 } } : {}),
        };
        tasks.push(t);
        previous = t;
      }
    }
    const quizDone = input.done.some(
      (i) => i.kind === "quiz" && i.contentId === c.contentId && i.topic === c.title,
    );
    let quiz: Task | undefined;
    if (!quizDone) {
      quiz = {
        ...base,
        seq: tasks.length,
        kind: "quiz",
        title: `Quiz: ${c.title}`,
        minutes: Math.min(QUIZ_MINUTES, mpd),
        optional: false,
        maxIdx: quizLimit,
        ...(previous ? { after: { task: previous, gap: QUIZ_GAP } } : {}),
        ...(!previous && lastDoneLearnDay
          ? {
              minIdx:
                days.findIndex((d) => d > lastDoneLearnDay) < 0
                  ? days.length
                  : days.findIndex((d) => d > lastDoneLearnDay),
            }
          : {}),
      };
      tasks.push(quiz);
    }
    if (weak) {
      const after = quiz ?? previous;
      tasks.push({
        ...base,
        seq: tasks.length,
        kind: "quiz",
        title: `Retry quiz: ${c.title}`,
        minutes: Math.min(RETRY_QUIZ_MINUTES, mpd),
        optional: true,
        maxIdx: lastIdx,
        ...(after ? { after: { task: after, gap: RETRY_GAP } } : {}),
      });
    }
  }

  // 5. Place day by day. Weak work first, then a share of quizzes, then learning, then the rest.
  const tier = (t: Task) =>
    t.weak && !t.optional ? 0 : t.optional ? 3 : t.kind === "quiz" ? 1 : 2;
  const pending = [...tasks].sort((a, b) => tier(a) - tier(b) || a.seq - b.seq);
  const ready = (t: Task, i: number) =>
    i >= (t.minIdx ?? 0) &&
    i <= t.maxIdx &&
    (!t.after ||
      (t.after.task.placedIdx !== undefined && t.after.task.placedIdx + t.after.gap <= i));
  // Pace the work across the days left instead of cramming it into the first few: the daily
  // target is the mandatory minutes over the days before the exam, plus some slack. A second
  // sweep without the target catches whatever the pacing left over.
  const mandatory = tasks.filter((t) => !t.optional);
  const pace = Math.min(
    mpd,
    Math.max(
      ...mandatory.map((t) => t.minutes),
      Math.ceil((mandatory.reduce((n, t) => n + t.minutes, 0) / (quizLimit + 1)) * PACE_SLACK),
    ),
  );
  const newToday = days.map(() => 0);
  const sweep = (paced: boolean) => {
    for (let i = 0; i < days.length; i++) {
      let quizUsed = 0;
      for (const pass of [0, 1]) {
        for (const t of pending) {
          const room = Math.min(free[i] ?? 0, paced ? pace - (newToday[i] ?? 0) : mpd);
          if (t.placedIdx !== undefined || !ready(t, i) || t.minutes > room) continue;
          const capped = pass === 0 && tier(t) === 1;
          if (capped && quizUsed + t.minutes > mpd * QUIZ_SHARE) continue;
          free[i] = (free[i] ?? 0) - t.minutes;
          newToday[i] = (newToday[i] ?? 0) + t.minutes;
          t.placedIdx = i;
          if (tier(t) === 1) quizUsed += t.minutes;
          put(i, t.kind, {
            title: t.title,
            minutes: t.minutes,
            contentId: t.contentId,
            topic: t.topic,
          });
        }
      }
    }
  };
  sweep(true);
  sweep(false);
  for (const t of tasks) {
    if (t.placedIdx === undefined && !t.optional) {
      unscheduled.push({ title: t.title, minutes: t.minutes });
    }
  }

  // 6. A rest day before the goal.
  if (restDay >= today && !input.done.some((i) => i.kind === "rest")) {
    put(
      -1,
      "rest",
      { title: "Rest before the goal", minutes: 0, contentId: null, topic: null },
      restDay,
    );
  }

  // Order each day: review, learn, quiz, exam.
  const byDay = new Map<string, typeof out>();
  for (const o of out) byDay.set(o.item.day, [...(byDay.get(o.item.day) ?? []), o]);
  const items: NewPlanItem[] = [];
  for (const day of [...byDay.keys()].sort()) {
    const list = (byDay.get(day) ?? []).sort(
      (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.seq - b.seq,
    );
    for (const [idx, o] of list.entries()) items.push({ ...o.item, idx });
  }
  return { items, unscheduled };
}
