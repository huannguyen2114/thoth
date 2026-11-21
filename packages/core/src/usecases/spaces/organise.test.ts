import { describe, expect, it } from "vitest";
import type { ContentId, SpaceId, TagId } from "../../shared/id";
import { world } from "./fakes.test-support";
import {
  createTag,
  deleteTag,
  filterByTags,
  listTags,
  moveContent,
  setContentTags,
  tagsByContent,
  updateSpace,
  updateTag,
} from "./organise";

describe("updateSpace", () => {
  it("changes only the fields given and returns the saved space", async () => {
    const w = world();
    const s = await w.spaces.create({ name: "Bio", description: null, color: null, icon: null });
    const r = await updateSpace(w, s.id, { color: "teal", icon: "flask" });
    expect(r.ok && r.value).toMatchObject({ name: "Bio", color: "teal", icon: "flask" });
  });

  it("refuses a hex colour, an unknown icon and an empty name", async () => {
    const w = world();
    const s = await w.spaces.create({ name: "Bio", description: null, color: null, icon: null });
    for (const bad of [{ color: "#ff0000" }, { icon: "rocket" }, { name: "  " }]) {
      const r = await updateSpace(w, s.id, bad as never);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    }
  });

  it("says when the space is gone", async () => {
    const r = await updateSpace(world(), "nope" as SpaceId, { name: "X" });
    expect(!r.ok && r.error.code).toBe("not_found");
  });
});

describe("moveContent", () => {
  it("moves between spaces and reports where it came from, for Undo", async () => {
    const w = world();
    const a = await w.spaces.create({ name: "A", description: null, color: null, icon: null });
    const b = await w.spaces.create({ name: "B", description: null, color: null, icon: null });
    const c = w.contents.add("Lecture", { spaceId: a.id });
    const r = await moveContent(w, { contentId: c.id, spaceId: b.id });
    expect(r.ok && r.value).toEqual({ from: a.id, to: b.id });
    expect(c.spaceId).toBe(b.id);
    const out = await moveContent(w, { contentId: c.id, spaceId: null });
    expect(out.ok && out.value.from).toBe(b.id);
    expect(c.spaceId).toBeNull();
  });

  it("refuses a missing content or space", async () => {
    const w = world();
    const c = w.contents.add("Lecture");
    expect((await moveContent(w, { contentId: "x" as ContentId, spaceId: null })).ok).toBe(false);
    const r = await moveContent(w, { contentId: c.id, spaceId: "gone" as SpaceId });
    expect(!r.ok && r.error.code).toBe("not_found");
    expect(c.spaceId).toBeNull();
  });
});

describe("tags", () => {
  it("creates once per name, whatever the case, and lists by name", async () => {
    const w = world();
    const first = await createTag(w, { name: "exam", color: "red" });
    const again = await createTag(w, { name: " EXAM " });
    expect(first.ok && again.ok && again.value.id === first.value.id).toBe(true);
    await createTag(w, { name: "biology" });
    expect((await listTags(w)).map((t) => t.name)).toEqual(["biology", "exam"]);
  });

  it("renames and recolours, refusing a name another tag has", async () => {
    const w = world();
    const a = await createTag(w, { name: "a" });
    await createTag(w, { name: "b" });
    if (!a.ok) throw new Error("setup");
    expect((await updateTag(w, a.value.id, { name: "b", color: "gray" })).ok).toBe(false);
    const r = await updateTag(w, a.value.id, { name: "Alpha", color: "purple" });
    expect(r.ok && r.value).toMatchObject({ name: "Alpha", color: "purple" });
    expect((await updateTag(w, "x" as TagId, { name: "c", color: "gray" })).ok).toBe(false);
  });

  it("assigns tags to a content and filters with every selected tag", async () => {
    const w = world();
    const one = w.contents.add("One");
    const two = w.contents.add("Two");
    const exam = await createTag(w, { name: "exam" });
    const bio = await createTag(w, { name: "bio" });
    if (!exam.ok || !bio.ok) throw new Error("setup");
    await setContentTags(w, {
      contentId: one.id,
      tagIds: [exam.value.id, bio.value.id, bio.value.id],
    });
    await setContentTags(w, { contentId: two.id, tagIds: [bio.value.id] });
    const map = await tagsByContent(w);
    expect(map.get(one.id)?.map((t) => t.name)).toEqual(["bio", "exam"]);

    const items = [one, two].map((c) => ({
      id: c.id,
      tagIds: (map.get(c.id) ?? []).map((t) => t.id as string),
    }));
    expect(filterByTags(items, [bio.value.id]).map((i) => i.id)).toEqual([one.id, two.id]);
    expect(filterByTags(items, [bio.value.id, exam.value.id]).map((i) => i.id)).toEqual([one.id]);
    expect(filterByTags(items, [])).toHaveLength(2);
  });

  it("refuses an unknown tag and removes assignments with the tag", async () => {
    const w = world();
    const one = w.contents.add("One");
    const r = await setContentTags(w, { contentId: one.id, tagIds: ["ghost"] });
    expect(!r.ok && r.error.code).toBe("not_found");
    const t = await createTag(w, { name: "x" });
    if (!t.ok) throw new Error("setup");
    await setContentTags(w, { contentId: one.id, tagIds: [t.value.id] });
    expect((await deleteTag(w, t.value.id)).ok).toBe(true);
    expect((await tagsByContent(w)).size).toBe(0);
  });
});
