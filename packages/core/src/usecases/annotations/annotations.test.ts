import { describe, expect, it } from "vitest";
import type { Annotation, NewAnnotation } from "../../domain/annotation";
import type { Chapter } from "../../domain/content";
import type {
  AnnotationRepository,
  ChapterRepository,
  LinkRecord,
  LinkRepository,
} from "../../ports/repositories";
import {
  type AnnotationId,
  type ChapterId,
  type ContentId,
  type NoteId,
  newId,
} from "../../shared/id";
import { FakeLlm, MemFlashcards, MemStudySets } from "../quiz/fakes";
import {
  CONTENT_ID,
  contentRow,
  FakeContents,
  FakeNotes,
  FakeSegments,
  pageSegments,
} from "../summary/fakes";
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  updateAnnotation,
} from "./annotations";
import { getBacklinks } from "./backlinks";
import {
  clozeOf,
  HIGHLIGHTS_SET_TITLE,
  highlightToFlashcard,
  passageToFlashcard,
} from "./highlight-flashcard";
import { linkLabel, shortTitle } from "./labels";
import { resolveLink, searchLinkTargets } from "./link-targets";

class MemAnnotations implements AnnotationRepository {
  rows: Annotation[] = [];
  async create(input: NewAnnotation) {
    const a: Annotation = {
      ...input,
      id: newId<AnnotationId>(),
      createdAt: new Date(this.rows.length),
      updatedAt: new Date(this.rows.length),
    };
    this.rows.push(a);
    return a;
  }
  async get(id: AnnotationId) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listByContent(contentId: ContentId) {
    return this.rows.filter((r) => r.contentId === contentId);
  }
  async update(id: AnnotationId, patch: Partial<Annotation>) {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
  }
  async delete(id: AnnotationId) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

class MemLinks implements LinkRepository {
  rows: LinkRecord[] = [];
  constructor(private readonly landsIn: (r: LinkRecord) => ContentId | null) {}
  async replaceFrom(fromKind: LinkRecord["fromKind"], fromId: string, links: LinkRecord[]) {
    this.rows = this.rows.filter((r) => !(r.fromKind === fromKind && r.fromId === fromId));
    this.rows.push(...links);
  }
  async backlinksTo(contentId: ContentId) {
    return this.rows.filter((r) => this.landsIn(r) === contentId);
  }
  async backlinksToAnnotation(id: AnnotationId) {
    return this.rows.filter((r) => r.anchor.kind === "annotation" && r.anchor.annotationId === id);
  }
}

const highlight = {
  kind: "highlight" as const,
  anchor: {
    kind: "content" as const,
    contentId: CONTENT_ID,
    locator: { type: "page" as const, page: 3 },
    quote: { exact: "Mitochondria make ATP", prefix: "", suffix: "" },
    rects: [{ page: 3, x: 0.1, y: 0.2, w: 0.5, h: 0.03 }],
  },
};

function setup() {
  const annotations = new MemAnnotations();
  const contents = new FakeContents(contentRow());
  return { deps: { annotations, contents }, annotations };
}

describe("annotations", () => {
  it("creates a highlight with a default colour and lists it", async () => {
    const { deps } = setup();
    const r = await createAnnotation(deps, CONTENT_ID, highlight);
    expect(r.ok && r.value.color).toBe("yellow");
    expect((await listAnnotations(deps, CONTENT_ID)).map((a) => a.kind)).toEqual(["highlight"]);
  });

  it("refuses an anchor into another content, a missing content and drawings without payload", async () => {
    const { deps } = setup();
    const other = await createAnnotation(deps, "c2" as ContentId, highlight);
    expect(other.ok === false && other.error.code).toBe("validation");
    const ink = await createAnnotation(deps, CONTENT_ID, { ...highlight, kind: "ink" });
    expect(ink.ok === false && ink.error.message).toContain("drawing");
    const empty = await createAnnotation(deps, CONTENT_ID, {
      kind: "highlight",
      anchor: { kind: "content", contentId: CONTENT_ID, locator: null },
    });
    expect(empty.ok).toBe(false);
    const gone = await createAnnotation(
      { ...deps, contents: new FakeContents(null) },
      CONTENT_ID,
      highlight,
    );
    expect(gone.ok === false && gone.error.code).toBe("not_found");
  });

  it("stores ink in page space and rejects points outside the page", async () => {
    const { deps } = setup();
    const ink = {
      kind: "ink",
      anchor: { kind: "content", contentId: CONTENT_ID, locator: { type: "page", page: 1 } },
      payload: {
        type: "ink",
        page: 1,
        width: 0.004,
        strokes: [
          [
            [0.1, 0.1, 0.5],
            [0.2, 0.2, 0.6],
          ],
        ],
      },
    };
    expect((await createAnnotation(deps, CONTENT_ID, ink)).ok).toBe(true);
    const off = { ...ink, payload: { ...ink.payload, strokes: [[[1.5, 0.1, 0.5]]] } };
    expect((await createAnnotation(deps, CONTENT_ID, off)).ok).toBe(false);
  });

  it("updates colour and comment, and deletes", async () => {
    const { deps } = setup();
    const created = await createAnnotation(deps, CONTENT_ID, highlight);
    if (!created.ok) throw new Error("setup");
    const u = await updateAnnotation(deps, created.value.id, { color: "blue", comment: " Key " });
    expect(u.ok && [u.value.color, u.value.comment]).toEqual(["blue", "Key"]);
    const bad = await updateAnnotation(deps, created.value.id, { color: "#ff0000" });
    expect(bad.ok).toBe(false);
    expect((await deleteAnnotation(deps, created.value.id)).ok).toBe(true);
    expect((await deleteAnnotation(deps, created.value.id)).ok).toBe(false);
  });

  it("keeps a comment annotation from losing its text", async () => {
    const { deps } = setup();
    const c = await createAnnotation(deps, CONTENT_ID, {
      ...highlight,
      kind: "comment",
      comment: "Why?",
    });
    if (!c.ok) throw new Error("setup");
    const r = await updateAnnotation(deps, c.value.id, { comment: "" });
    expect(r.ok === false && r.error.code).toBe("validation");
  });
});

describe("backlinks", () => {
  it("groups links by annotation, set and position, with the note's owner, and counts notes", async () => {
    const { deps, annotations } = setup();
    const a = await createAnnotation(deps, CONTENT_ID, highlight);
    if (!a.ok) throw new Error("setup");
    const links = new MemLinks((r) =>
      r.anchor.kind === "content" ? r.anchor.contentId : CONTENT_ID,
    );
    const base = { fromKind: "note" as const, fromContentId: CONTENT_ID, fromSpaceId: null };
    await links.replaceFrom("note", "n1", [
      {
        ...base,
        fromId: "n1",
        label: "p.3",
        anchor: { kind: "annotation", annotationId: a.value.id },
      },
      {
        ...base,
        fromId: "n1",
        label: "Lecture · p.5",
        anchor: { kind: "content", contentId: CONTENT_ID, locator: { type: "page", page: 5 } },
      },
    ]);
    await links.replaceFrom("note", "n2", [
      {
        ...base,
        fromId: "n2",
        fromContentId: null,
        fromSpaceId: null,
        label: "again",
        anchor: { kind: "annotation", annotationId: a.value.id },
      },
    ]);
    const b = await getBacklinks({ links, contents: deps.contents }, CONTENT_ID);
    expect(b.noteCount).toBe(2);
    expect(b.total).toBe(3);
    const byKey = Object.fromEntries(b.groups.map((g) => [g.key, g]));
    expect(byKey[`a:${a.value.id}`]?.sources).toHaveLength(2);
    expect(byKey["at:p.5"]?.sources[0]).toMatchObject({
      href: `thoth:c/${CONTENT_ID}?at=p.5`,
      owner: { kind: "content", contentId: CONTENT_ID, title: "Lecture" },
    });
    expect(byKey[`a:${a.value.id}`]?.sources[1]?.owner).toEqual({ kind: "unknown" });
    expect(annotations.rows).toHaveLength(1);
  });
});

describe("highlight to flashcard", () => {
  it("blanks the most telling word for the cloze", () => {
    expect(clozeOf("The mitochondria make ATP for the cell")).toEqual({
      front: "The _____ make ATP for the cell",
      answer: "mitochondria",
    });
    expect(clozeOf("a is b").front).toBe("a is b\n\n_____?");
  });

  it("adds cards to one 'From highlights' deck, keeping the locator and comment", async () => {
    const { deps } = setup();
    const studySets = new MemStudySets();
    const flashcards = new MemFlashcards();
    const created = await createAnnotation(deps, CONTENT_ID, {
      ...highlight,
      comment: "Remember this",
    });
    if (!created.ok) throw new Error("setup");
    const d = { ...deps, studySets, flashcards };
    const r = await highlightToFlashcard(d, created.value.id);
    expect(r.ok && r.value.card).toMatchObject({
      front: "_____ make ATP",
      back: "Mitochondria make ATP\n\nRemember this",
      locator: { type: "page", page: 3 },
      idx: 0,
    });
    const again = await passageToFlashcard(d, {
      contentId: CONTENT_ID,
      quote: "Chlorophyll absorbs light",
    });
    expect(again.ok && again.value.card.idx).toBe(1);
    expect(studySets.rows.map((s) => s.title)).toEqual([HIGHLIGHTS_SET_TITLE]);
    expect(studySets.rows[0]?.status).toBe("ready");
  });

  it("uses Claude's question when asked, and falls back to the cloze when it fails", async () => {
    const { deps } = setup();
    const llm = new FakeLlm(() => ({ question: "What makes ATP?" }));
    const d = {
      ...deps,
      studySets: new MemStudySets(),
      flashcards: new MemFlashcards(),
      llm: async () => llm,
    };
    const r = await passageToFlashcard(d, {
      contentId: CONTENT_ID,
      quote: "Mitochondria make ATP",
      suggest: true,
    });
    expect(r.ok && [r.value.card.front, r.value.suggested]).toEqual(["What makes ATP?", true]);
    expect(llm.requests[0]?.task).toBe("flashcards");
    const bad = new FakeLlm(() => ({ nope: 1 }));
    const f = await passageToFlashcard(
      { ...d, llm: async () => bad },
      { contentId: CONTENT_ID, quote: "Mitochondria make ATP", suggest: true },
    );
    expect(f.ok && [f.value.card.front, f.value.suggested]).toEqual(["_____ make ATP", false]);
  });

  it("refuses a too-short passage", async () => {
    const { deps } = setup();
    const r = await passageToFlashcard(
      { ...deps, studySets: new MemStudySets(), flashcards: new MemFlashcards() },
      { contentId: CONTENT_ID, quote: "a" },
    );
    expect(r.ok === false && r.error.code).toBe("validation");
  });
});

describe("link labels and targets", () => {
  it("labels chips as 'title · place' and shortens long titles at a word", () => {
    expect(linkLabel("Lecture 2", "p.3")).toBe("Lecture 2 · p.3");
    expect(shortTitle("Thermodynamics and the arrow of time in physics")).toBe(
      "Thermodynamics and the…",
    );
  });

  it("lists the current content's chapters, annotations and a typed page", async () => {
    const { deps } = setup();
    const a = await createAnnotation(deps, CONTENT_ID, highlight);
    if (!a.ok) throw new Error("setup");
    const chapter: Chapter = {
      id: "ch1" as ChapterId,
      contentId: CONTENT_ID,
      idx: 0,
      title: "Cell energy",
      summary: "ATP",
      locator: { type: "page", page: 2 },
    };
    const chapters: ChapterRepository = {
      replaceForContent: async () => {},
      listByContent: async () => [chapter],
    };
    const studySets = new MemStudySets();
    await studySets.create({
      kind: "summary",
      contentId: CONTENT_ID,
      spaceId: null,
      title: "Overview",
      options: {},
      body: "ATP is energy",
    });
    const full = {
      ...deps,
      chapters,
      studySets,
      notes: new FakeNotes(),
      segments: new FakeSegments(pageSegments()),
    };
    const empty = await searchLinkTargets(full, { query: "", contentId: CONTENT_ID });
    expect(empty.map((t) => t.group)).toEqual(["This source", "Annotations", "Summaries"]);
    expect(empty[1]).toMatchObject({ href: `thoth:a/${a.value.id}`, chipLabel: "Lecture · p.3" });
    const typed = await searchLinkTargets(full, { query: "p.4", contentId: CONTENT_ID });
    expect(typed[0]).toMatchObject({
      href: `thoth:c/${CONTENT_ID}?at=p.4`,
      chipLabel: "Lecture · p.4",
    });

    const r = await resolveLink(full, `thoth:a/${a.value.id}`);
    expect(r.ok && r.value).toMatchObject({ kind: "annotation", contentId: CONTENT_ID });
    const broken = await resolveLink(full, `thoth:a/${newId<NoteId>()}`);
    expect(broken.ok === false && broken.error.code).toBe("not_found");
  });
});
