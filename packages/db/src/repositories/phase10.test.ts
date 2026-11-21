import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnnotationId, ChatId, ContentId, StudySetId } from "@thoth/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db, migrateDb } from "../client";
import { DrizzleAnnotationRepository } from "./annotation-repository";
import { DrizzleChatRepository } from "./chat-repository";
import { DrizzleContentRepository } from "./content-repository";
import { DrizzleLinkRepository } from "./link-repository";
import { DrizzleNoteRepository } from "./note-repository";
import { DrizzleSpaceRepository } from "./space-repository";
import { DrizzleTagRepository } from "./tag-repository";

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

let db: Db;
beforeEach(async () => {
  db = createDb(":memory:");
  await migrateDb(db, MIGRATIONS);
});

const newContent = (title = "Cells") =>
  new DrizzleContentRepository(db).create({
    spaceId: null,
    kind: "pdf",
    title,
    sourceUrl: null,
    filePath: null,
  });
const newSpace = () =>
  new DrizzleSpaceRepository(db).create({
    name: "Bio",
    description: null,
    color: null,
    icon: null,
  });

describe("Phase 10 repositories", () => {
  it("spaces.update changes only the fields given", async () => {
    const repo = new DrizzleSpaceRepository(db);
    const s = await newSpace();
    await repo.update(s.id, { color: "teal", icon: "flask" });
    expect(await repo.get(s.id)).toMatchObject({ name: "Bio", color: "teal", icon: "flask" });
    await repo.update(s.id, { name: "Biology" });
    expect(await repo.get(s.id)).toMatchObject({ name: "Biology", color: "teal" });
  });

  it("notes: one per content and one per space, never mixed", async () => {
    const notes = new DrizzleNoteRepository(db);
    const c = await newContent();
    const s = await newSpace();
    const a = await notes.save({ contentId: c.id }, "content notes");
    const b = await notes.save({ spaceId: s.id }, "space notes");
    const a2 = await notes.save({ contentId: c.id }, "content notes v2");
    expect(a2.id).toBe(a.id);
    expect(b).toMatchObject({ spaceId: s.id, contentId: null });
    expect((await notes.get({ spaceId: s.id }))?.markdown).toBe("space notes");
    expect((await notes.get({ contentId: c.id }))?.markdown).toBe("content notes v2");
    await expect(
      db.run(
        sql`INSERT INTO notes (id, content_id, space_id, markdown) VALUES ('x', ${c.id}, ${s.id}, '')`,
      ),
    ).rejects.toThrow();
  });

  it("chats: space chats are listed apart from content chats", async () => {
    const chats = new DrizzleChatRepository(db);
    const c = await newContent();
    const s = await newSpace();
    await chats.create(c.id, "About cells");
    const sc = await chats.createForSpace(s.id, "Across Bio");
    expect(sc).toMatchObject({ spaceId: s.id, contentId: null });
    expect((await chats.listBySpace(s.id)).map((x) => x.title)).toEqual(["Across Bio"]);
    expect((await chats.listByContent(c.id)).map((x) => x.title)).toEqual(["About cells"]);
  });

  it("annotations: reading order, update, delete", async () => {
    const repo = new DrizzleAnnotationRepository(db);
    const c = await newContent();
    const anchor = (page: number) => ({
      kind: "content" as const,
      contentId: c.id,
      locator: { type: "page" as const, page },
      rects: [{ page, x: 0.1, y: 0.2, w: 0.3, h: 0.02 }],
    });
    const p5 = await repo.create({
      contentId: c.id,
      kind: "highlight",
      anchor: anchor(5),
      color: "yellow",
      comment: null,
      payload: null,
    });
    await repo.create({
      contentId: c.id,
      kind: "ink",
      anchor: anchor(2),
      color: "blue",
      comment: null,
      payload: { type: "ink", page: 2, strokes: [[[0.1, 0.1, 0.5]]], width: 0.004 },
    });
    expect((await repo.listByContent(c.id)).map((a) => a.anchor.locator)).toEqual([
      { type: "page", page: 2 },
      { type: "page", page: 5 },
    ]);
    await repo.update(p5.id, { comment: "Key idea", color: "green" });
    expect(await repo.get(p5.id)).toMatchObject({ comment: "Key idea", color: "green" });
    await repo.delete(p5.id);
    expect(await repo.listByContent(c.id)).toHaveLength(1);
  });

  it("links: replaceFrom swaps a note's links and backlinks resolve to the content", async () => {
    const anns = new DrizzleAnnotationRepository(db);
    const links = new DrizzleLinkRepository(db);
    const c = await newContent();
    const other = await newContent("Other");
    const hl = await anns.create({
      contentId: c.id,
      kind: "highlight",
      anchor: { kind: "content", contentId: c.id, locator: { type: "page", page: 3 } },
      color: "yellow",
      comment: null,
      payload: null,
    });
    const from = {
      fromKind: "note" as const,
      fromId: "n1",
      fromContentId: other.id,
      fromSpaceId: null,
    };
    await links.replaceFrom("note", "n1", [
      { ...from, label: "p.3", anchor: { kind: "annotation", annotationId: hl.id } },
      { ...from, label: "intro", anchor: { kind: "content", contentId: c.id, locator: null } },
      { ...from, label: "gone", anchor: { kind: "set", setId: "nope" as StudySetId } },
    ]);
    expect((await links.backlinksTo(c.id)).map((l) => l.label).sort()).toEqual(["intro", "p.3"]);
    expect((await links.backlinksToAnnotation(hl.id)).map((l) => l.fromContentId)).toEqual([
      other.id,
    ]);
    await links.replaceFrom("note", "n1", []);
    expect(await links.backlinksTo(c.id)).toEqual([]);
    expect(await links.backlinksToAnnotation("x" as AnnotationId)).toEqual([]);
  });

  it("tags: assign, list per content, cascade on delete", async () => {
    const tags = new DrizzleTagRepository(db);
    const c = await newContent();
    const exam = await tags.create("exam", "red");
    const ch1 = await tags.create("chapter 1", "blue");
    await tags.setForContent(c.id, [exam.id, ch1.id, exam.id]);
    expect((await tags.listForContent(c.id)).map((t) => t.name)).toEqual(["chapter 1", "exam"]);
    await tags.delete(exam.id);
    expect(await tags.listAssignments()).toEqual([{ contentId: c.id, tagId: ch1.id }]);
    await expect(tags.create("chapter 1", "gray")).rejects.toThrow();
  });
});

describe("migration 0008 keeps existing data", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("copies notes (new ids) and chats with their messages", async () => {
    // A copy of the migrations folder that stops at 0007, then the real one.
    dir = mkdtempSync(join(tmpdir(), "thoth-mig-"));
    cpSync(MIGRATIONS, dir, { recursive: true });
    const journal = JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8"));
    journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < 8);
    writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify(journal));

    const old = createDb(`file:${join(dir, "t.db")}`);
    await migrateDb(old, dir);
    await old.run(sql`INSERT INTO contents (id, kind, title) VALUES ('c1', 'text', 'Old')`);
    await old.run(sql`INSERT INTO notes (content_id, markdown) VALUES ('c1', '# kept')`);
    await old.run(sql`INSERT INTO chats (id, content_id, title) VALUES ('ch1', 'c1', 'Q')`);
    await old.run(
      sql`INSERT INTO chat_messages (id, chat_id, role, text) VALUES ('m1', 'ch1', 'user', 'hi')`,
    );

    await migrateDb(old, MIGRATIONS);
    const note = await new DrizzleNoteRepository(old).get({ contentId: "c1" as ContentId });
    expect(note?.markdown).toBe("# kept");
    expect(note?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const chats = new DrizzleChatRepository(old);
    expect((await chats.listByContent("c1" as ContentId)).map((c) => c.spaceId)).toEqual([null]);
    expect((await chats.listMessages("ch1" as ChatId)).map((m) => m.text)).toEqual(["hi"]);
  });
});
