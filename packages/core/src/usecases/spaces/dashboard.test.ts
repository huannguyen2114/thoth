import { describe, expect, it } from "vitest";
import { newId, type PlanItemId, type SpaceId } from "../../shared/id";
import { getSpaceDashboard } from "./dashboard";
import { world } from "./fakes.test-support";

const NOW = new Date(Date.UTC(2026, 10, 21, 12));
const clock = { now: NOW, tzOffsetMin: 0 };

async function setup() {
  const w = world();
  const space = await w.spaces.create({ name: "Bio", description: null, color: null, icon: null });
  const other = await w.spaces.create({ name: "Art", description: null, color: null, icon: null });
  const cell = w.contents.add("Cells", { spaceId: space.id });
  const dna = w.contents.add("DNA", { spaceId: space.id });
  const paint = w.contents.add("Paint", { spaceId: other.id });
  return { w, space, other, cell, dna, paint };
}

describe("getSpaceDashboard", () => {
  it("counts due cards only from the space's own flashcard sets", async () => {
    const { w, space, cell, paint } = await setup();
    for (const c of [cell, paint]) {
      const set = await w.studySets.create({
        kind: "flashcards",
        contentId: c.id,
        spaceId: null,
        title: `${c.title} cards`,
        options: {},
      });
      const card = { idx: 0, front: "Q", back: "A", topic: "T", locator: null };
      await w.flashcards.addCards(set.id, [card, { ...card, idx: 1 }], new Date(2026, 0, 1));
    }
    const r = await getSpaceDashboard(w, space.id, clock);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.cards.due).toBe(2);
    expect(r.value.cards.sets).toEqual([
      expect.objectContaining({ title: "Cells cards", contentTitle: "Cells", due: 2, total: 2 }),
    ]);
  });

  it("scores weak topics from the space's quizzes only", async () => {
    const { w, space, cell, paint } = await setup();
    for (const [c, score] of [
      [cell, 0.25],
      [paint, 0],
    ] as const) {
      const set = await w.studySets.create({
        kind: "quiz",
        contentId: c.id,
        spaceId: null,
        title: "Quiz",
        options: {},
      });
      const [q] = await w.quizzes.addQuestions(set.id, [
        {
          idx: 0,
          type: "true_false",
          difficulty: "easy",
          prompt: "P",
          choices: null,
          answer: { type: "true_false", value: true },
          explanation: "",
          topic: `${c.title} basics`,
          locator: null,
        },
      ]);
      if (!q) throw new Error("setup");
      await w.quizzes.addAttempt({
        questionId: q.id,
        response: {},
        correct: false,
        score,
        feedback: null,
      });
    }
    const r = await getSpaceDashboard(w, space.id, clock);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.progress.answered).toBe(1);
    expect(r.value.progress.weak.map((t) => t.topic)).toEqual(["Cells basics"]);
  });

  it("shows today's tasks and the countdown of a plan that targets this space", async () => {
    const { w, space, other, cell } = await setup();
    const mine = await w.plans.create({
      title: "Bio final",
      goalDate: "2026-11-30",
      minutesPerDay: 30,
      studyDays: [1, 2, 3, 4, 5],
      spaceId: space.id,
      contentIds: [cell.id],
    });
    const theirs = await w.plans.create({
      title: "Art show",
      goalDate: "2026-11-25",
      minutesPerDay: 30,
      studyDays: [1],
      spaceId: other.id,
      contentIds: [],
    });
    for (const p of [mine, theirs]) {
      w.plans.items.push({
        id: newId<PlanItemId>(),
        planId: p.id,
        day: "2026-11-21",
        idx: 0,
        kind: "learn",
        title: `${p.title} task`,
        minutes: 20,
        contentId: null,
        topic: null,
        doneAt: null,
      });
    }
    const r = await getSpaceDashboard(w, space.id, clock);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.today.items.map((i) => i.title)).toEqual(["Bio final task"]);
    expect(r.value.countdown).toMatchObject({ title: "Bio final", daysLeft: 9 });
  });

  it("lists recent activity in the space and resumes the last studied content", async () => {
    const { w, space, cell, dna, paint } = await setup();
    await w.activity.record("note_edit", cell.id, new Date(2026, 10, 20));
    await w.activity.record("content_added", paint.id, new Date(2026, 10, 20, 1));
    await w.activity.record("note_edit", space.id, new Date(2026, 10, 20, 2));
    const r = await getSpaceDashboard(w, space.id, clock);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.recent.map((i) => i.href)).toEqual([
      `/spaces/${space.id}?tab=notes`,
      `/content/${cell.id}`,
    ]);
    expect(r.value.resume).toMatchObject({ contentId: cell.id, reason: "recent" });
    expect(dna.title).toBe("DNA");
  });

  it("suggests the first ready content when nothing was studied yet", async () => {
    const { w, space, cell } = await setup();
    const r = await getSpaceDashboard(w, space.id, clock);
    expect(r.ok && r.value.resume).toMatchObject({ contentId: cell.id, reason: "start" });
    expect(r.ok && r.value.contents).toEqual({ total: 2, ready: 2, processing: 0 });
  });

  it("returns not_found for a deleted space", async () => {
    const r = await getSpaceDashboard(world(), "x" as SpaceId, clock);
    expect(!r.ok && r.error.code).toBe("not_found");
  });
});
