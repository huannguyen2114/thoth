import { describe, expect, it } from "vitest";
import {
  CONTENT_ID,
  FakeLlm,
  fakeChapters,
  fakeContent,
  fakeSegments,
  MemFlashcards,
  MemStudySets,
} from "../quiz/fakes";
import { runFlashcardGeneration, startFlashcardGeneration } from "./generate-flashcards";
import { deleteCard, editCard, listDueCards, listFlashcardSets, reviewCard } from "./review";
import { generatedCardsSchema } from "./schemas";

const NOW = new Date("2026-03-01T09:00:00Z");
const reply = {
  cards: [
    {
      front: "Why do cells make ATP?",
      back: "It carries usable energy.",
      topic: "ATP",
      source: "[p.1]",
    },
    {
      front: "What does the Krebs cycle produce?",
      back: "NADH, FADH2 and a little ATP.",
      topic: "Krebs cycle",
      source: "[p.3]",
    },
    {
      front: "Which gas is released?",
      back: "Carbon dioxide.",
      topic: "Made-up topic",
      source: null,
    },
  ],
};

function setup(r: unknown = reply) {
  const llm = new FakeLlm(() => r);
  const deps = {
    contents: fakeContent(),
    chapters: fakeChapters(),
    segments: fakeSegments(),
    studySets: new MemStudySets(),
    flashcards: new MemFlashcards(),
    llm: async () => llm,
    now: () => NOW,
  };
  return { deps, llm };
}
const options = { count: 3, chapterIds: [] };

describe("generatedCardsSchema", () => {
  it("accepts a good reply and rejects bad ones", () => {
    expect(generatedCardsSchema.safeParse(reply).success).toBe(true);
    expect(generatedCardsSchema.safeParse({ cards: [] }).success).toBe(false);
    expect(
      generatedCardsSchema.safeParse({
        cards: [{ front: "Q?", back: "", topic: "a", source: null }],
      }).success,
    ).toBe(false);
    expect(
      generatedCardsSchema.safeParse({ cards: [{ front: "Question", back: "a", source: null }] })
        .success,
    ).toBe(false);
  });
});

describe("flashcard generation", () => {
  it("creates a set, stores cards that are due now, and maps topics and citations", async () => {
    const { deps, llm } = setup();
    const started = await startFlashcardGeneration(deps, { contentId: CONTENT_ID, options });
    if (!started.ok) throw new Error("start failed");
    expect(started.value).toMatchObject({ kind: "flashcards", status: "generating" });
    expect((await runFlashcardGeneration(deps, started.value.id)).ok).toBe(true);
    const cards = await deps.flashcards.listBySet(started.value.id);
    expect(cards.map((c) => c.topic)).toEqual(["ATP", "Krebs cycle", "ATP"]); // unknown topic falls back to the first
    expect(cards[1]?.locator).toEqual({ type: "page", page: 3 });
    expect(cards.every((c) => c.fsrs.due.getTime() === NOW.getTime() && c.fsrs.state === 0)).toBe(
      true,
    );
    expect(llm.requests[0]?.task).toBe("flashcards");
    expect(llm.requests[0]?.context).toContain("=== TOPIC: Krebs cycle ===");
  });

  it("marks the set failed on a bad reply, and validates options up front", async () => {
    const { deps } = setup({ cards: [{ front: "x" }] });
    const started = await startFlashcardGeneration(deps, { contentId: CONTENT_ID, options });
    if (!started.ok) throw new Error("start failed");
    expect(await runFlashcardGeneration(deps, started.value.id)).toMatchObject({
      ok: false,
      error: { code: "llm_bad_output" },
    });
    expect((await deps.studySets.get(started.value.id))?.status).toBe("failed");
    expect(
      await startFlashcardGeneration(deps, {
        contentId: CONTENT_ID,
        options: { count: 0, chapterIds: [] },
      }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(
      await startFlashcardGeneration(deps, {
        contentId: CONTENT_ID,
        options: { count: 3, chapterIds: ["zzz"] },
      }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
  });
});

describe("review", () => {
  async function withCards() {
    const { deps } = setup();
    const started = await startFlashcardGeneration(deps, { contentId: CONTENT_ID, options });
    if (!started.ok) throw new Error("start failed");
    await runFlashcardGeneration(deps, started.value.id);
    return { deps, setId: started.value.id };
  }

  it("lists due cards with the label of each button", async () => {
    const { deps } = await withCards();
    const due = await listDueCards(deps);
    expect(due).toHaveLength(3);
    expect(due[0]?.intervals).toEqual({ 1: "1m", 2: "6m", 3: "10m", 4: "8d" });
  });

  it("Good moves the card out of the due list; Again keeps it due within minutes", async () => {
    const { deps } = await withCards();
    const [a, b] = await deps.flashcards.listBySet(
      (await listFlashcardSets(deps, CONTENT_ID))[0]?.set.id as never,
    );
    if (!a || !b) throw new Error("cards missing");
    const good = await reviewCard(deps, { cardId: a.id, rating: 3 });
    expect(good.ok && good.value.next.due.getTime()).toBeGreaterThan(NOW.getTime());
    const again = await reviewCard(deps, { cardId: b.id, rating: 1 });
    expect(again.ok && again.value.next.due.getTime() - NOW.getTime()).toBe(60_000);
    expect(deps.flashcards.reviews.map((r) => r.rating)).toEqual([3, 1]);
    // One minute later the "Again" card is due again, the "Good" card is not.
    const later = { ...deps, now: () => new Date(NOW.getTime() + 61_000) };
    const dueIds = (await listDueCards(later)).map((d) => d.card.id);
    expect(dueIds).toContain(b.id);
    expect(dueIds).not.toContain(a.id);
  });

  it("rejects a bad rating and an unknown card", async () => {
    const { deps } = await withCards();
    expect(await reviewCard(deps, { cardId: "x" as never, rating: 3 })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await reviewCard(deps, { cardId: "x" as never, rating: 9 as never })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
  });

  it("edits and deletes cards, refusing an empty side", async () => {
    const { deps, setId } = await withCards();
    const [card] = await deps.flashcards.listBySet(setId);
    if (!card) throw new Error("no card");
    expect(
      await editCard(deps, { cardId: card.id, front: "  New front ", back: "New back" }),
    ).toEqual({ ok: true, value: undefined });
    expect((await deps.flashcards.get(card.id))?.front).toBe("New front");
    expect(await editCard(deps, { cardId: card.id, front: "x", back: "  " })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect((await deleteCard(deps, card.id)).ok).toBe(true);
    expect(await deleteCard(deps, card.id)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("counts due cards per set", async () => {
    const { deps } = await withCards();
    expect((await listFlashcardSets(deps, CONTENT_ID))[0]).toMatchObject({
      cardCount: 3,
      dueCount: 3,
    });
  });
});
