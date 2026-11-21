import { describe, expect, it } from "vitest";
import type { SpaceId } from "../../shared/id";
import { createSpaceBoard, listSpaceBoards } from "../whiteboard/boards";
import { MemWhiteboards } from "../whiteboard/fakes";
import { MemSpaces } from "./fakes.test-support";

describe("space boards", () => {
  it("creates numbered boards owned by the space, not by a content", async () => {
    const spaces = new MemSpaces();
    const whiteboards = new MemWhiteboards();
    const s = await spaces.create({ name: "Bio", description: null, color: null, icon: null });
    const first = await createSpaceBoard({ spaces, whiteboards }, { spaceId: s.id });
    const second = await createSpaceBoard(
      { spaces, whiteboards },
      { spaceId: s.id, title: " Map " },
    );
    expect(first.ok && first.value).toMatchObject({
      spaceId: s.id,
      contentId: null,
      title: "Board 1",
    });
    expect(second.ok && second.value.title).toBe("Map");
    expect(await listSpaceBoards({ whiteboards }, s.id)).toHaveLength(2);
    const gone = await createSpaceBoard({ spaces, whiteboards }, { spaceId: "x" as SpaceId });
    expect(!gone.ok && gone.error.code).toBe("not_found");
  });
});
