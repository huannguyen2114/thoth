import { describe, expect, it } from "vitest";
import type { Content } from "../../domain/content";
import type { StudySet } from "../../domain/study-set";
import type {
  ContentRepository,
  FlashcardRepository,
  NoteRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type { ContentId, StudySetId } from "../../shared/id";
import { ankiTag, csvField, csvRow, flashcardsToAnkiCsv } from "./csv";
import { exportContentMarkdown, exportFlashcardsCsv } from "./export";
import { contentToMarkdown, slugify } from "./markdown";

describe("csv", () => {
  it("leaves plain fields alone and quotes special ones", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField("a\r\nb")).toBe('"a\r\nb"');
  });
  it("keeps non-ASCII text as is", () => {
    expect(csvRow(["Đây là gì?", "日本語, ok"])).toBe('Đây là gì?,"日本語, ok"');
  });
  it("turns a topic into one Anki tag", () => {
    expect(ankiTag(" Cell  biology, basics ")).toBe("Cell_biology_basics");
  });
  it("writes Anki headers, a tags column and one row per card", () => {
    const out = flashcardsToAnkiCsv([
      { front: "What is ATP?", back: 'Energy, "currency"', topic: "Cell biology" },
      { front: "Two\nlines", back: "b", topic: "" },
    ]);
    expect(out).toBe(
      [
        "#separator:Comma",
        "#html:false",
        "#tags column:3",
        'What is ATP?,"Energy, ""currency""",Cell_biology',
        '"Two\nlines",b,',
        "",
      ].join("\n"),
    );
  });
});

describe("markdown", () => {
  it("slugifies titles safely", () => {
    expect(slugify("Intro to Biology!")).toBe("intro-to-biology");
    expect(slugify("Café / Müller")).toBe("cafe-muller");
    expect(slugify("日本語", "fallback")).toBe("fallback");
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });
  it("assembles title, source, notes and summaries", () => {
    const md = contentToMarkdown({
      title: "T",
      sourceUrl: "https://x.test",
      notes: "my notes\n",
      summaries: [{ title: "Short", body: "body" }],
    });
    expect(md).toBe(
      "# T\n\nSource: https://x.test\n\n## Notes\n\nmy notes\n\n## Summary: Short\n\nbody\n",
    );
  });
});

const cid = "c1" as ContentId;
const set = (over: Partial<StudySet>): StudySet => ({
  id: "s1" as StudySetId,
  kind: "summary",
  contentId: cid,
  spaceId: null,
  title: "Sum",
  options: {},
  body: "text",
  status: "ready",
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe("export use cases", () => {
  const contents = {
    get: async (id: string) =>
      id === "c1" ? ({ id: cid, title: "My Lecture", sourceUrl: null } as Content) : null,
  } as unknown as ContentRepository;
  const notesOf = (markdown: string | null) =>
    ({
      get: async () =>
        markdown === null ? null : { contentId: cid, markdown, updatedAt: new Date() },
    }) as unknown as NoteRepository;
  const sets = (list: StudySet[]) =>
    ({
      listByContent: async () => list,
      get: async (id: string) => list.find((s) => s.id === id) ?? null,
    }) as unknown as StudySetRepository;

  it("exports notes and ready summaries only", async () => {
    const r = await exportContentMarkdown(
      {
        contents,
        notes: notesOf("hello"),
        studySets: sets([
          set({}),
          set({ id: "s2" as StudySetId, status: "generating", body: null }),
        ]),
      },
      cid,
    );
    expect(r.ok && r.value.filename).toBe("my-lecture.md");
    expect(r.ok && r.value.body).toContain("## Summary: Sum");
    expect(r.ok && r.value.body.match(/## Summary/g)).toHaveLength(1);
  });
  it("explains when there is nothing to export", async () => {
    const r = await exportContentMarkdown(
      { contents, notes: notesOf(" "), studySets: sets([]) },
      cid,
    );
    expect(!r.ok && r.error.code).toBe("validation");
  });
  it("reports a missing content", async () => {
    const r = await exportContentMarkdown(
      { contents, notes: notesOf(null), studySets: sets([]) },
      "nope" as ContentId,
    );
    expect(!r.ok && r.error.code).toBe("not_found");
  });
  it("exports a flashcard set as CSV and rejects other kinds", async () => {
    const flashcards = {
      listBySet: async () => [{ front: "q", back: "a", topic: "t" }],
    } as unknown as FlashcardRepository;
    const ok = await exportFlashcardsCsv(
      { studySets: sets([set({ kind: "flashcards", title: "Deck 1", body: null })]), flashcards },
      "s1" as StudySetId,
    );
    expect(ok.ok && ok.value.filename).toBe("deck-1.csv");
    const bad = await exportFlashcardsCsv(
      { studySets: sets([set({})]), flashcards },
      "s1" as StudySetId,
    );
    expect(!bad.ok && bad.error.code).toBe("not_found");
  });
});
