import { describe, expect, it } from "vitest";
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
    expect(await getNote(deps, CONTENT_ID)).toEqual({ markdown: "", updatedAt: null });
    const saved = await saveNote(deps, CONTENT_ID, "# Mine");
    expect(saved.ok).toBe(true);
    expect((await getNote(deps, CONTENT_ID)).markdown).toBe("# Mine");
  });

  it("refuses oversized notes and notes for missing content", async () => {
    const { deps } = setup();
    const big = await saveNote(deps, CONTENT_ID, "x".repeat(MAX_NOTES_CHARS + 1));
    expect(big.ok === false && big.error.code).toBe("validation");
    const gone = setup(undefined, null as never);
    const r = await saveNote(gone.deps, CONTENT_ID, "hi");
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
