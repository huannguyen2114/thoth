import type { Segment } from "../../domain/content";
import {
  type BoardElement,
  type BoardOp,
  boardColors,
  inkColors,
  type Whiteboard,
} from "../../domain/whiteboard";
import type { LlmProvider } from "../../ports/llm";
import type { ContentId, WhiteboardId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { type BoardDeps, commitOps } from "./boards";
import { type Box, elementBox, GRID, overlaps, unionBox } from "./geometry";
import {
  askSystemPrompt,
  askUserMessage,
  type ClaudeFields,
  type ClaudeOps,
  chapterList,
  claudeOpsSchema,
} from "./prompts";
import { linkFor, loadSource, type SourceDeps } from "./source";

export interface AskDeps extends BoardDeps, SourceDeps {
  llm: () => Promise<LlmProvider>;
}

export const MAX_REQUEST = 2000;

export interface AskResult {
  board: Whiteboard;
  summary: string;
  /** Ids Claude added or changed: the canvas animates and selects them. */
  touched: string[];
  /** Operations Claude wrote that were not applied, with why (shown as a note). */
  skipped: { message: string }[];
}

const INK = new Set<string>(inkColors);
const FILL = new Set<string>(boardColors);
/** A fill colour named for text or an arrow, and the other way round. */
const toInk: Record<string, string> = {
  yellow: "terracotta",
  peach: "terracotta",
  pink: "terracotta",
  green: "green",
  blue: "blue",
  purple: "purple",
  white: "ink",
};
const toFill: Record<string, string> = {
  ink: "white",
  terracotta: "peach",
  blue: "blue",
  green: "green",
  purple: "purple",
};

const short = () => Math.random().toString(36).slice(2, 8);

/** Claude's flat fields as element fields for `type`, dropping what that type cannot hold. */
function fieldsFor(
  type: string,
  f: ClaudeFields,
  source: BoardElement["source"],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined) out[k] = v;
  };
  // Models sometimes put a shape's words in "label" or "title"; the words matter more than the field.
  const words = f.text?.trim() ? f.text : (f.label ?? f.title ?? f.text);
  const box = () => {
    set("x", f.x);
    set("y", f.y);
    set("w", f.w);
    set("h", f.h);
  };
  const color = (ink: boolean) => {
    if (f.color === undefined) return;
    if (ink) set("color", INK.has(f.color) ? f.color : toInk[f.color]);
    else set("color", FILL.has(f.color) ? f.color : toFill[f.color]);
  };
  switch (type) {
    case "shape":
      box();
      set("text", words);
      set("kind", f.kind);
      set("size", f.size === "huge" ? "title" : f.size);
      color(false);
      break;
    case "sticky":
      box();
      set("text", words);
      color(false);
      break;
    case "text":
      set("x", f.x);
      set("y", f.y);
      set("text", f.text);
      set("size", f.size);
      set("wrap", f.w);
      color(true);
      break;
    case "section":
      box();
      set("title", f.title ?? f.text);
      color(false);
      break;
    case "arrow":
      set("from", f.from);
      set("to", f.to);
      set("label", f.label ?? f.text);
      set("dash", f.dash);
      color(true);
      break;
    case "table":
      set("x", f.x);
      set("y", f.y);
      set("rows", f.rows);
      break;
  }
  if (source) out.source = source;
  return out;
}

/**
 * Turns Claude's reply into board operations (doc 18):
 * - new ids get a unique prefix, and later references to them follow;
 * - every new element is marked `by: "claude"`;
 * - source tokens become links only when they point at a real place in the content;
 * - operations on a person's element are dropped unless its id is in `mayChange`.
 */
export function toBoardOps(
  reply: ClaudeOps,
  board: readonly BoardElement[],
  ctx: { contentId: string | null; segments: readonly Segment[]; mayChange: ReadonlySet<string> },
): { ops: BoardOp[]; skipped: { message: string }[] } {
  const existing = new Map(board.map((e) => [e.id, e]));
  const prefix = `c${short()}-`;
  const rename = new Map<string, string>();
  const idOf = (raw: string) => rename.get(raw) ?? raw;
  const ops: BoardOp[] = [];
  const skipped: { message: string }[] = [];
  const typeOf = new Map<string, string>();

  for (const op of reply.ops) {
    const f = op.fields ?? {};
    const source =
      ctx.contentId && f.source ? linkFor(f.source, ctx.contentId, ctx.segments) : undefined;
    if (op.op === "add") {
      if (!f.type) {
        skipped.push({ message: `"${op.id}" has no type.` });
        continue;
      }
      const id = `${prefix}${op.id.replace(/[^A-Za-z0-9_.~:@+-]/g, "")}`.slice(0, 40);
      rename.set(op.id, id);
      typeOf.set(id, f.type);
      const fields = fieldsFor(f.type, f, source);
      if (f.type === "arrow") {
        if (fields.from) fields.from = idOf(String(fields.from));
        if (fields.to) fields.to = idOf(String(fields.to));
      }
      ops.push({ op: "add", element: { ...fields, id, type: f.type, by: "claude" } as never });
      continue;
    }
    const id = idOf(op.id);
    const target = existing.get(id);
    if (target?.by === "person" && !ctx.mayChange.has(id)) {
      skipped.push({ message: `Left your element "${id}" as it is.` });
      continue;
    }
    if (op.op === "remove") {
      ops.push({ op: "remove", id });
      continue;
    }
    const type = target?.type ?? typeOf.get(id);
    if (!type) {
      skipped.push({ message: `"${op.id}" is not on the board.` });
      continue;
    }
    const patch = fieldsFor(type, f, source);
    if (type === "arrow") {
      if (patch.from) patch.from = idOf(String(patch.from));
      if (patch.to) patch.to = idOf(String(patch.to));
    }
    if (Object.keys(patch).length === 0) continue;
    ops.push({ op: "update", id, patch });
  }
  return { ops, skipped };
}

/**
 * Keeps Claude's new elements off the existing ones. If any new element would overlap an
 * element already on the board, the whole new group moves, as one, to the right of the board
 * (its own layout stays as Claude drew it). Updates are left where Claude put them.
 */
export function placeBesideBoard(ops: BoardOp[], board: readonly BoardElement[]): BoardOp[] {
  const added = ops.flatMap((o) => (o.op === "add" ? [o.element] : []));
  const boxes = added.map(elementBox).filter((b): b is Box => b !== null);
  const kept = board.filter((e) => !ops.some((o) => o.op === "remove" && o.id === e.id));
  const old = kept.map(elementBox).filter((b): b is Box => b !== null);
  const group = unionBox(boxes);
  const all = unionBox(old);
  if (!group || !all) return ops;
  if (!boxes.some((b) => old.some((o) => overlaps(b, o)))) return ops;
  const dx = all.x + all.w + GRID * 4 - group.x;
  const dy = all.y - group.y;
  return ops.map((o) => {
    if (o.op !== "add" || !("x" in o.element)) return o;
    return { ...o, element: { ...o.element, x: o.element.x + dx, y: o.element.y + dy } };
  });
}

/**
 * "Ask Claude…" on a board (ADR-0031, doc 18). Claude reads the board, the source and the
 * request and returns operations; core converts, guards and places them, then applies them
 * with compare-and-swap. People's elements change only when their ids are in `mayChange`
 * (the person selected them before asking).
 */
export async function askClaude(
  deps: AskDeps,
  input: {
    boardId: WhiteboardId;
    request: string;
    mayChange?: readonly string[];
    signal?: AbortSignal;
  },
): Promise<Result<AskResult>> {
  const request = input.request.trim();
  if (!request) return err(appError("validation", "Say what Claude should draw."));
  if (request.length > MAX_REQUEST) {
    return err(appError("validation", `Keep the request under ${MAX_REQUEST} characters.`));
  }
  const board = await deps.whiteboards.get(input.boardId);
  if (!board) return err(appError("not_found", "This board no longer exists."));

  let segments: Segment[] = [];
  let sourceText = "";
  let chapters = "";
  if (board.contentId) {
    const src = await loadSource(deps, board.contentId as ContentId);
    if (!src.ok) return src;
    segments = src.value.segments;
    sourceText = src.value.text;
    chapters = chapterList(src.value.chapters);
  }

  const mayChange = new Set(input.mayChange ?? []);
  const llm = await deps.llm();
  const reply = await llm.generateObject(
    {
      task: "chat",
      system: askSystemPrompt(),
      ...(sourceText ? { context: sourceText } : {}),
      messages: [
        {
          role: "user",
          content: askUserMessage({
            boardTitle: board.title,
            elements: board.elements,
            mayChange: [...mayChange],
            request,
            chapters,
          }),
        },
      ],
      ...(input.signal ? { signal: input.signal } : {}),
    },
    claudeOpsSchema,
  );
  if (!reply.ok) return reply;

  const skipped: { message: string }[] = [];
  const saved = await commitOps(
    deps,
    input.boardId,
    (latest) => {
      const converted = toBoardOps(reply.value, latest.elements, {
        contentId: latest.contentId,
        segments,
        mayChange,
      });
      skipped.splice(0, skipped.length, ...converted.skipped);
      return placeBesideBoard(converted.ops, latest.elements);
    },
    { lenient: true },
  );
  if (!saved.ok) return saved;
  for (const r of saved.value.refused) skipped.push({ message: r.message });
  const touched = saved.value.applied.flatMap((o) =>
    o.op === "add" ? [o.element.id] : o.op === "update" ? [o.id] : [],
  );
  return ok({
    board: saved.value.board,
    summary: reply.value.summary.trim(),
    touched,
    skipped,
  });
}
