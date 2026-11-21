"use server";

import {
  applyOps,
  askClaude,
  type BoardElement,
  type ContentId,
  createBoard,
  createSpaceBoard,
  deleteBoard,
  generateMindMap,
  getBoard,
  listBoards,
  listSourceAnchors,
  listSpaceBoards,
  renameBoard,
  type SourcePlace,
  type SpaceId,
  type Whiteboard,
  type WhiteboardId,
} from "@thoth/core";
import { after } from "next/server";
import { getContainer } from "@/server/container";
import { type RunKind, type RunState, whiteboardRuns } from "./runs";

/** Plain, serialisable shapes the client works with. Thin: every rule lives in core. */
export interface BoardDto {
  id: string;
  title: string;
  version: number;
  elements: BoardElement[];
  updatedAt: number;
}
export interface BoardSummaryDto {
  id: string;
  title: string;
  count: number;
  updatedAt: number;
  running: { id: string; kind: RunKind } | null;
}

const toDto = (b: Whiteboard): BoardDto => ({
  id: b.id,
  title: b.title,
  version: b.version,
  elements: b.elements,
  updatedAt: b.updatedAt.getTime(),
});

async function deps() {
  const c = await getContainer();
  return {
    whiteboards: c.whiteboards,
    contents: c.contents,
    segments: c.segments,
    chapters: c.chapters,
    activity: c.activity,
    llm: () => c.llm(),
  };
}

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function listBoardsAction(contentId: string): Promise<BoardSummaryDto[]> {
  const boards = await listBoards(await deps(), contentId as ContentId);
  const runs = whiteboardRuns();
  return boards.map((b) => ({
    id: b.id,
    title: b.title,
    count: b.elements.length,
    updatedAt: b.updatedAt.getTime(),
    running: runs.runningOn(b.id),
  }));
}

export async function loadBoardAction(boardId: string): Promise<ActionResult<BoardDto>> {
  const r = await getBoard(await deps(), boardId as WhiteboardId);
  return r.ok ? { ok: true, value: toDto(r.value) } : { ok: false, error: r.error.message };
}

export async function createBoardAction(
  contentId: string,
  title?: string,
): Promise<ActionResult<BoardDto>> {
  const r = await createBoard(await deps(), {
    contentId: contentId as ContentId,
    ...(title ? { title } : {}),
  });
  return r.ok ? { ok: true, value: toDto(r.value) } : { ok: false, error: r.error.message };
}

export async function renameBoardAction(boardId: string, title: string) {
  const r = await renameBoard(await deps(), boardId as WhiteboardId, title);
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error.message };
}

export async function deleteBoardAction(boardId: string) {
  const r = await deleteBoard(await deps(), boardId as WhiteboardId);
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error.message };
}

/**
 * The canvas autosave. Sends only what changed (as operations); core applies them on top of
 * the latest version, so a save never undoes what Claude added meanwhile.
 */
export async function applyOpsAction(
  boardId: string,
  ops: unknown[],
): Promise<ActionResult<BoardDto>> {
  const r = await applyOps(await deps(), { boardId: boardId as WhiteboardId, ops });
  return r.ok ? { ok: true, value: toDto(r.value) } : { ok: false, error: r.error.message };
}

export async function sourceAnchorsAction(contentId: string): Promise<SourcePlace[]> {
  return listSourceAnchors(await deps(), contentId as ContentId);
}

/** "Ask Claude…": starts in the background and returns the run id at once. */
export async function startAskAction(
  boardId: string,
  request: string,
  mayChange: string[],
): Promise<ActionResult<{ runId: string }>> {
  const d = await deps();
  const trimmed = request.trim();
  if (!trimmed) return { ok: false, error: "Say what Claude should draw." };
  const runs = whiteboardRuns();
  if (runs.runningOn(boardId)) return { ok: false, error: "Claude is already drawing here." };
  const run = runs.start(boardId, "ask", async (signal) => {
    const r = await askClaude(d, {
      boardId: boardId as WhiteboardId,
      request: trimmed,
      mayChange,
      signal,
    });
    return r.ok
      ? {
          ok: true,
          value: {
            summary: r.value.summary,
            touched: r.value.touched,
            skipped: r.value.skipped.map((s) => s.message),
          },
        }
      : r;
  });
  after(() => run.done);
  return { ok: true, value: { runId: run.id } };
}

/** "Mind map": creates a board for it, starts Claude, and returns both ids at once. */
export async function startMindMapAction(
  contentId: string,
  focus: string,
): Promise<ActionResult<{ runId: string; board: BoardDto }>> {
  const d = await deps();
  const clean = focus.trim();
  const created = await createBoard(d, {
    contentId: contentId as ContentId,
    title: clean ? `Mind map: ${clean}` : "Mind map",
  });
  if (!created.ok) return { ok: false, error: created.error.message };
  const boardId = created.value.id;
  const run = whiteboardRuns().start(boardId, "mindmap", async (signal) => {
    const r = await generateMindMap(d, { boardId, ...(clean ? { focus: clean } : {}), signal });
    if (!r.ok) {
      // A map that never arrived leaves no empty board behind.
      const now = await d.whiteboards.get(boardId);
      if (now && now.elements.length === 0) await d.whiteboards.delete(boardId);
      return r;
    }
    return { ok: true, value: { summary: "", touched: r.value.touched, skipped: [] } };
  });
  after(() => run.done);
  return { ok: true, value: { runId: run.id, board: toDto(created.value) } };
}

export async function readRunAction(runId: string): Promise<RunState | null> {
  return whiteboardRuns().read(runId);
}

export async function stopRunAction(runId: string): Promise<void> {
  whiteboardRuns().stop(runId);
}

/** A space's boards (Phase 10, doc 22): same list shape as a content's. */
export async function listSpaceBoardsAction(spaceId: string): Promise<BoardSummaryDto[]> {
  const boards = await listSpaceBoards(await deps(), spaceId as SpaceId);
  const runs = whiteboardRuns();
  return boards.map((b) => ({
    id: b.id,
    title: b.title,
    count: b.elements.length,
    updatedAt: b.updatedAt.getTime(),
    running: runs.runningOn(b.id),
  }));
}

export async function createSpaceBoardAction(spaceId: string): Promise<ActionResult<BoardDto>> {
  const c = await getContainer();
  const r = await createSpaceBoard(
    { whiteboards: c.whiteboards, spaces: c.spaces },
    { spaceId: spaceId as SpaceId },
  );
  return r.ok ? { ok: true, value: toDto(r.value) } : { ok: false, error: r.error.message };
}
