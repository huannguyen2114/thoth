import { NOTE_EDIT_THROTTLE_MS } from "../../domain/activity";
import type { BoardElement, BoardOp, Whiteboard } from "../../domain/whiteboard";
import type {
  ActivityRepository,
  ContentRepository,
  SpaceRepository,
  WhiteboardRepository,
} from "../../ports/repositories";
import type { ContentId, SpaceId, WhiteboardId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { applyOpsToElements, type OpRefusal } from "./ops";

export interface BoardDeps {
  whiteboards: WhiteboardRepository;
  contents: ContentRepository;
  activity?: ActivityRepository;
}

export const MAX_TITLE = 120;
export const MAX_ELEMENTS = 2000;

/** whiteboard_edit is recorded at most once per board per hour, like note_edit (ADR-0023). */
export const WHITEBOARD_EDIT_THROTTLE_MS = NOTE_EDIT_THROTTLE_MS;

async function recordEdit(activity: ActivityRepository | undefined, boardId: string, at: Date) {
  if (!activity) return;
  try {
    await activity.recordThrottled("whiteboard_edit", boardId, at, WHITEBOARD_EDIT_THROTTLE_MS);
  } catch {
    // The habit tracker is a nice-to-have; the edit already succeeded.
  }
}

const cleanTitle = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);

export async function createBoard(
  deps: Pick<BoardDeps, "whiteboards" | "contents">,
  input: { contentId: ContentId; title?: string; elements?: BoardElement[] },
): Promise<Result<Whiteboard>> {
  const content = await deps.contents.get(input.contentId);
  if (!content) return err(appError("not_found", "This content no longer exists."));
  const existing = await deps.whiteboards.listByContent(input.contentId);
  const title = cleanTitle(input.title ?? "") || `Board ${existing.length + 1}`;
  return ok(
    await deps.whiteboards.create({
      contentId: input.contentId,
      spaceId: null,
      title,
      elements: input.elements ?? [],
    }),
  );
}

/** A board owned by a space, for the space page (Phase 10, doc 22). Its elements may link any content. */
export async function createSpaceBoard(
  deps: Pick<BoardDeps, "whiteboards"> & { spaces: SpaceRepository },
  input: { spaceId: SpaceId; title?: string },
): Promise<Result<Whiteboard>> {
  if (!(await deps.spaces.get(input.spaceId))) {
    return err(appError("not_found", "This space no longer exists."));
  }
  const existing = await deps.whiteboards.listBySpace(input.spaceId);
  const title = cleanTitle(input.title ?? "") || `Board ${existing.length + 1}`;
  return ok(
    await deps.whiteboards.create({ contentId: null, spaceId: input.spaceId, title, elements: [] }),
  );
}

/** A space's boards, newest first. */
export async function listSpaceBoards(
  deps: Pick<BoardDeps, "whiteboards">,
  spaceId: SpaceId,
): Promise<Whiteboard[]> {
  return deps.whiteboards.listBySpace(spaceId);
}

/** Newest first. */
export async function listBoards(
  deps: Pick<BoardDeps, "whiteboards">,
  contentId: ContentId,
): Promise<Whiteboard[]> {
  return deps.whiteboards.listByContent(contentId);
}

export async function getBoard(
  deps: Pick<BoardDeps, "whiteboards">,
  id: WhiteboardId,
): Promise<Result<Whiteboard>> {
  const board = await deps.whiteboards.get(id);
  return board ? ok(board) : err(appError("not_found", "This board no longer exists."));
}

export async function renameBoard(
  deps: Pick<BoardDeps, "whiteboards">,
  id: WhiteboardId,
  title: string,
): Promise<Result<void>> {
  const clean = cleanTitle(title);
  if (!clean) return err(appError("validation", "Give the board a name."));
  if (!(await deps.whiteboards.get(id))) {
    return err(appError("not_found", "This board no longer exists."));
  }
  await deps.whiteboards.rename(id, clean);
  return ok(undefined);
}

export async function deleteBoard(
  deps: Pick<BoardDeps, "whiteboards">,
  id: WhiteboardId,
): Promise<Result<void>> {
  if (!(await deps.whiteboards.get(id))) {
    return err(appError("not_found", "This board no longer exists."));
  }
  await deps.whiteboards.delete(id);
  return ok(undefined);
}

export interface AppliedOps {
  board: Whiteboard;
  applied: BoardOp[];
  refused: OpRefusal[];
}

/**
 * Loads the latest board, applies the operations and saves with compare-and-swap. A stale
 * version (someone saved in between) reloads and re-applies once; operations target ids, so
 * they land on top of the other change. `lenient` skips refused operations instead of
 * refusing the whole list (Claude's output); `transform` may adjust the operations against
 * the board they will apply to, on every attempt.
 */
export async function commitOps(
  deps: Pick<BoardDeps, "whiteboards" | "activity">,
  boardId: WhiteboardId,
  ops: readonly unknown[] | ((board: Whiteboard) => readonly unknown[]),
  options: { lenient: boolean; now?: Date },
): Promise<Result<AppliedOps>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const board = await deps.whiteboards.get(boardId);
    if (!board) return err(appError("not_found", "This board no longer exists."));
    const list = typeof ops === "function" ? ops(board) : ops;
    const outcome = applyOpsToElements(board.elements, list);
    if (!options.lenient && outcome.refused.length > 0) {
      const first = outcome.refused[0];
      const which = list.length > 1 && first ? `Change ${first.index + 1}: ` : "";
      return err(appError("validation", `${which}${first?.message ?? "Invalid change."}`));
    }
    if (outcome.elements.length > MAX_ELEMENTS) {
      return err(appError("validation", `A board holds at most ${MAX_ELEMENTS} elements.`));
    }
    if (outcome.applied.length === 0) {
      return ok({ board, applied: [], refused: outcome.refused });
    }
    const saved = await deps.whiteboards.save(boardId, outcome.elements, board.version);
    if (saved) {
      await recordEdit(deps.activity, boardId, options.now ?? new Date());
      return ok({ board: saved, applied: outcome.applied, refused: outcome.refused });
    }
  }
  return err(
    appError("conflict", "The board changed twice while saving. Reload it and try again."),
  );
}

/**
 * Applies a person's (or the canvas's) operations: all or nothing. Every operation is
 * validated against `boardOpSchema` and the board; any refusal refuses the list.
 */
export async function applyOps(
  deps: Pick<BoardDeps, "whiteboards" | "activity">,
  input: { boardId: WhiteboardId; ops: unknown },
): Promise<Result<Whiteboard>> {
  if (!Array.isArray(input.ops)) return err(appError("validation", "Send a list of changes."));
  if (input.ops.length > MAX_ELEMENTS) return err(appError("validation", "Too many changes."));
  const r = await commitOps(deps, input.boardId, input.ops, { lenient: false });
  return r.ok ? ok(r.value.board) : r;
}
