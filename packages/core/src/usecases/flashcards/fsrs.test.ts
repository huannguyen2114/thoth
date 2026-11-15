import { describe, expect, it } from "vitest";
import { newFsrsState } from "../../domain/flashcard";
import { formatInterval, previewReview, scheduleReview, toCard } from "./fsrs";

const T0 = new Date("2026-03-01T09:00:00Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("scheduleReview with a fixed clock", () => {
  it("Good on a new card moves the due date into the future", () => {
    const s = scheduleReview(newFsrsState(T0), 3, T0);
    expect(s.due.getTime()).toBeGreaterThan(T0.getTime());
    expect(s).toMatchObject({ state: 1, reps: 1, lapses: 0, lastReview: T0 });
  });

  it("Again keeps the card due soon (a minute), Easy sends it days away", () => {
    const again = scheduleReview(newFsrsState(T0), 1, T0);
    expect(again.due).toEqual(min(1));
    const easy = scheduleReview(newFsrsState(T0), 4, T0);
    expect(easy.state).toBe(2);
    expect(easy.scheduledDays).toBeGreaterThanOrEqual(5);
    expect(easy.due.getTime()).toBe(T0.getTime() + easy.scheduledDays * 86_400_000);
  });

  it("orders the four ratings from soonest to latest", () => {
    const p = previewReview(newFsrsState(T0), T0);
    expect(p[1].getTime()).toBeLessThan(p[2].getTime());
    expect(p[2].getTime()).toBeLessThan(p[3].getTime());
    expect(p[3].getTime()).toBeLessThan(p[4].getTime());
  });

  it("is deterministic: the same state and clock give the same schedule", () => {
    expect(scheduleReview(newFsrsState(T0), 3, T0)).toEqual(
      scheduleReview(newFsrsState(T0), 3, T0),
    );
  });

  it("follows the learning steps across saved states (1m, 10m, then graduates)", () => {
    const first = scheduleReview(newFsrsState(T0), 3, T0); // step 1 of 2: due in 10m
    expect(first.due).toEqual(min(10));
    expect(toCard(first).learning_steps).toBe(1);
    const second = scheduleReview(first, 3, first.due);
    expect(second.state).toBe(2);
    expect(second.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it("a lapse after graduating relearns the card and counts the lapse", () => {
    const grad = scheduleReview(
      scheduleReview(newFsrsState(T0), 4, T0),
      3,
      new Date(T0.getTime() + 9 * 86_400_000),
    );
    const lapsed = scheduleReview(grad, 1, grad.due);
    expect(lapsed.state).toBe(3);
    expect(lapsed.lapses).toBe(grad.lapses + 1);
    expect(lapsed.due.getTime() - grad.due.getTime()).toBeLessThan(86_400_000);
  });

  it("maps a card round trip without changing fields", () => {
    const s = scheduleReview(newFsrsState(T0), 3, T0);
    const c = toCard(s);
    expect(c).toMatchObject({
      due: s.due,
      stability: s.stability,
      difficulty: s.difficulty,
      reps: s.reps,
      state: s.state,
    });
  });
});

describe("formatInterval", () => {
  it("picks a readable unit", () => {
    expect(formatInterval(T0, min(1))).toBe("1m");
    expect(formatInterval(T0, min(10))).toBe("10m");
    expect(formatInterval(T0, min(180))).toBe("3h");
    expect(formatInterval(T0, new Date(T0.getTime() + 8 * 86_400_000))).toBe("8d");
    expect(formatInterval(T0, new Date(T0.getTime() + 90 * 86_400_000))).toBe("3mo");
  });
});
