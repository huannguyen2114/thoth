import type { Segment } from "../../domain/content";
import type { Whiteboard } from "../../domain/whiteboard";
import type { ContentId, WhiteboardId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import type { AskDeps } from "./ask-claude";
import { commitOps } from "./boards";
import { boardBounds, GRID } from "./geometry";
import { mindMapElements, type TreeNode } from "./layout";
import {
  type ClaudeMindMap,
  chapterList,
  claudeMindMapSchema,
  mindMapSystemPrompt,
  mindMapUserMessage,
} from "./prompts";
import { linkFor, loadSource } from "./source";

export const MAX_MIND_MAP_NODES = 60;
export const MAX_MIND_MAP_DEPTH = 4;
const MAX_LABEL = 60;

const clean = (s: string, max: number) =>
  s
    .replace(/\s+/g, " ")
    .replace(/[.;:,]+$/, "")
    .trim()
    .slice(0, max);

/**
 * Turns the model's flat node list into a tree core can trust:
 * - one root (several roots, or none, get a root made from the title);
 * - nodes whose parent is missing, or that sit in a cycle, are dropped;
 * - depth and node count are capped, labels are trimmed;
 * - a source token is kept only when it points at a real place in the content.
 * Node ids become n0, n1… in reading order, so element ids are short and safe.
 */
export function buildTree(
  reply: ClaudeMindMap,
  ctx: { contentId: string; segments: readonly Segment[] },
): TreeNode | null {
  const nodes = reply.nodes.filter((n) => clean(n.label, MAX_LABEL));
  const byId = new Map<string, (typeof nodes)[number]>();
  for (const n of nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  const roots = [...byId.values()].filter((n) => n.parent === null || !byId.has(n.parent));
  const childrenOf = new Map<string, string[]>();
  for (const n of byId.values()) {
    if (n.parent === null || !byId.has(n.parent)) continue;
    childrenOf.set(n.parent, [...(childrenOf.get(n.parent) ?? []), n.id]);
  }

  let counter = 0;
  const visited = new Set<string>();
  const make = (id: string, depth: number): TreeNode | null => {
    const n = byId.get(id);
    if (!n || visited.has(id) || counter >= MAX_MIND_MAP_NODES) return null;
    visited.add(id);
    const source = linkFor(n.source, ctx.contentId, ctx.segments)?.token;
    const node: TreeNode = {
      id: `n${counter++}`,
      label: clean(n.label, MAX_LABEL),
      children: [],
      ...(source ? { source } : {}),
    };
    if (depth + 1 < MAX_MIND_MAP_DEPTH) {
      for (const c of childrenOf.get(id) ?? []) {
        const child = make(c, depth + 1);
        if (child) node.children.push(child);
      }
    }
    return node;
  };

  const single = roots.length === 1 && roots[0]?.parent === null ? roots[0] : undefined;
  if (single) return make(single.id, 0);
  // No single root: the title becomes the root and every top node a branch.
  const title = clean(reply.title, MAX_LABEL);
  if (!title || roots.length === 0) return null;
  const root: TreeNode = { id: `n${counter++}`, label: title, children: [] };
  for (const r of roots) {
    const child = make(r.id, 1);
    if (child) root.children.push(child);
  }
  return root;
}

/**
 * "Mind map" (ADR-0031, doc 18): Claude returns a concept tree; core lays it out with the
 * tidy-tree layout and adds it to the board, below anything already there. The layout never
 * depends on the model.
 */
export async function generateMindMap(
  deps: AskDeps,
  input: { boardId: WhiteboardId; focus?: string; signal?: AbortSignal },
): Promise<Result<{ board: Whiteboard; touched: string[] }>> {
  const board = await deps.whiteboards.get(input.boardId);
  if (!board) return err(appError("not_found", "This board no longer exists."));
  if (!board.contentId) return err(appError("validation", "A mind map needs a source."));
  const src = await loadSource(deps, board.contentId as ContentId);
  if (!src.ok) return src;

  const focus = input.focus?.trim().slice(0, 200) || undefined;
  const llm = await deps.llm();
  const reply = await llm.generateObject(
    {
      task: "chat",
      system: mindMapSystemPrompt(),
      context: src.value.text,
      messages: [
        {
          role: "user",
          content: mindMapUserMessage({
            title: src.value.content.title,
            chapters: chapterList(src.value.chapters),
            ...(focus ? { focus } : {}),
          }),
        },
      ],
      ...(input.signal ? { signal: input.signal } : {}),
    },
    claudeMindMapSchema,
  );
  if (!reply.ok) return reply;
  const tree = buildTree(reply.value, { contentId: board.contentId, segments: src.value.segments });
  if (!tree || tree.children.length === 0) {
    return err(appError("llm_bad_output", "Claude did not return a usable map. Try again."));
  }

  const prefix = `m${Math.random().toString(36).slice(2, 6)}-`;
  const saved = await commitOps(
    deps,
    input.boardId,
    (latest) => {
      const bounds = boardBounds(latest.elements);
      const origin = bounds ? { x: bounds.x, y: bounds.y + bounds.h + GRID * 4 } : { x: 0, y: 0 };
      return mindMapElements({
        root: tree,
        title: clean(reply.value.title, 80) || tree.label,
        takeaway: reply.value.takeaway.trim().slice(0, 160),
        contentId: board.contentId as string,
        prefix,
        origin,
      }).map((element) => ({ op: "add", element }));
    },
    { lenient: false },
  );
  if (!saved.ok) return saved;
  const touched = saved.value.applied.flatMap((o) => (o.op === "add" ? [o.element.id] : []));
  return ok({ board: saved.value.board, touched });
}
