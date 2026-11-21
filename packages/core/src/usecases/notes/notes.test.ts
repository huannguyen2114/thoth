import { describe, expect, it } from "vitest";
import type { LinkRecord, LinkRepository, LinkSourceKind } from "../../ports/repositories";
import type { SpaceId } from "../../shared/id";
import { appError, err } from "../../shared/result";
import {
  CONTENT_ID,
  contentRow,
  FakeContents,
  FakeLlm,
  FakeNotes,
  FakeSegments,
  pageSegments,
} from "../summary/fakes";
import { draftNotes, getNote, MAX_NOTES_CHARS, type NotesDeps, saveNote } from "./notes";

function setup(llm = new FakeLlm(["# Notes\n", "- point [p.2]"]), content = contentRow()) {
  const notes = new FakeNotes();
  const deps: NotesDeps = {
    contents: new FakeContents(content),
    segments: new FakeSegments(pageSegments()),
    notes,
    llm: async () => llm,
  };
  return { deps, notes, llm };
}

describe("notes", () => {
  it("returns an empty note before anything is saved, then what was saved", async () => {
    const { deps } = setup();
    expect(await getNote(deps, { contentId: CONTENT_ID })).toEqual({
      markdown: "",
      updatedAt: null,
    });
    const saved = await saveNote(deps, { contentId: CONTENT_ID }, "# Mine");
    expect(saved.ok).toBe(true);
    expect((await getNote(deps, { contentId: CONTENT_ID })).markdown).toBe("# Mine");
  });

  it("refuses oversized notes and notes for missing content", async () => {
    const { deps } = setup();
    const big = await saveNote(deps, { contentId: CONTENT_ID }, "x".repeat(MAX_NOTES_CHARS + 1));
    expect(big.ok === false && big.error.code).toBe("validation");
    const gone = setup(undefined, null as never);
    const r = await saveNote(gone.deps, { contentId: CONTENT_ID }, "hi");
    expect(r.ok === false && r.error.code).toBe("not_found");
  });

  it("drafts notes from the whole source with tokens, and does not save them", async () => {
    const { deps, notes, llm } = setup();
    const r = await draftNotes(deps, CONTENT_ID, { language: "French" });
    expect(r).toEqual({ ok: true, value: "# Notes\n- point [p.2]" });
    expect(notes.saved).toBeNull();
    expect(llm.requests[0]?.task).toBe("summary");
    expect(llm.requests[0]?.system).toContain("Write in French.");
    expect(llm.requests[0]?.context).toContain("[p.6] Page 6 text");
  });

  it("passes through a model failure and rejects empty replies", async () => {
    const failing = setup(
      new FakeLlm([], null, err(appError("llm_unavailable", "Not signed in."))),
    );
    const r = await draftNotes(failing.deps, CONTENT_ID);
    expect(r.ok === false && r.error.code).toBe("llm_unavailable");
    const empty = setup(new FakeLlm(["   "]));
    const e = await draftNotes(empty.deps, CONTENT_ID);
    expect(e.ok === false && e.error.code).toBe("llm_bad_output");
  });
});

describe("notes links (Phase 10)", () => {
  class MemLinks implements LinkRepository {
    rows: LinkRecord[] = [];
    async replaceFrom(fromKind: LinkSourceKind, fromId: string, links: LinkRecord[]) {
      this.rows = this.rows.filter((r) => !(r.fromKind === fromKind && r.fromId === fromId));
      this.rows.push(...links);
    }
    async backlinksTo() {
      return this.rows;
    }
    async backlinksToAnnotation() {
      return [];
    }
  }

  it("re-indexes the note's thoth links on every save", async () => {
    const { deps } = setup();
    const links = new MemLinks();
    const d = { ...deps, links };
    await saveNote(
      d,
      { contentId: CONTENT_ID },
      `A [p.3](thoth:c/${CONTENT_ID}?at=p.3) and [x](thoth:a/h1)`,
    );
    expect(links.rows.map((r) => r.anchor.kind)).toEqual(["content", "annotation"]);
    expect(links.rows[0]).toMatchObject({
      fromKind: "note",
      fromContentId: CONTENT_ID,
      label: "p.3",
    });
    await saveNote(d, { contentId: CONTENT_ID }, "no links now");
    expect(links.rows).toEqual([]);
  });

  it("saves a space's notes only when the space exists", async () => {
    const { deps } = setup();
    const space = {
      id: "sp1" as SpaceId,
      name: "Bio",
      description: null,
      color: null,
      icon: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const spaces = {
      create: async () => space,
      get: async (id: SpaceId) => (id === space.id ? space : null),
      list: async () => [space],
      update: async () => {},
    };
    const missing = await saveNote(deps, { spaceId: space.id }, "hi");
    expect(missing.ok === false && missing.error.code).toBe("not_found");
    const r = await saveNote({ ...deps, spaces }, { spaceId: space.id }, "space notes");
    expect(r.ok && r.value).toMatchObject({ spaceId: space.id, contentId: null });
  });
});
