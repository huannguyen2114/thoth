import {
  type BoardElement,
  type BoardOp,
  boardOpSchema,
  elementSchema,
} from "../../domain/whiteboard";

/** Why one operation was refused. `index` is its position in the list that was sent. */
export interface OpRefusal {
  index: number;
  message: string;
}

export interface OpsOutcome {
  elements: BoardElement[];
  /** The operations that were applied, parsed (defaults filled in). */
  applied: BoardOp[];
  refused: OpRefusal[];
}

/** Keys an update may never change: they identify the element. */
const FIXED_KEYS = ["id", "type"] as const;

function issue(e: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const first = e.issues[0];
  if (!first) return "Invalid operation.";
  const path = first.path.map(String).join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

function checkArrow(el: BoardElement, byId: Map<string, BoardElement>): string | null {
  if (el.type !== "arrow") return null;
  if (el.from === el.to) return "An arrow must connect two different elements.";
  for (const end of [el.from, el.to]) {
    const target = byId.get(end);
    if (!target) return `The arrow points at "${end}", which is not on the board.`;
    if (target.type === "arrow") return "An arrow cannot point at another arrow.";
  }
  return null;
}

/**
 * Applies operations in order to a copy of `elements` (ADR-0031). Pure: the board itself is
 * untouched. Every operation is checked against `boardOpSchema` and against the board as it
 * stands after the operations before it:
 *
 * - `add` needs a new id; an arrow's ends must be other, non-arrow elements on the board.
 * - `update` needs an existing id, cannot change `id` or `type`, and the patched element must
 *   still be valid. A `null` in the patch clears that field (for example `source`).
 * - `remove` needs an existing id and also removes the arrows attached to it.
 * - A locked element can only be unlocked.
 *
 * A refused operation is skipped and reported; the rest still apply. Callers that need
 * all-or-nothing (`applyOps`) refuse the whole list when `refused` is not empty.
 */
export function applyOpsToElements(
  elements: readonly BoardElement[],
  ops: readonly unknown[],
): OpsOutcome {
  let list = [...elements];
  const byId = new Map(list.map((e) => [e.id, e]));
  const applied: BoardOp[] = [];
  const refused: OpRefusal[] = [];

  for (const [index, raw] of ops.entries()) {
    const parsed = boardOpSchema.safeParse(raw);
    if (!parsed.success) {
      refused.push({ index, message: issue(parsed.error) });
      continue;
    }
    const op = parsed.data;
    const refuse = (message: string) => refused.push({ index, message });

    if (op.op === "add") {
      if (byId.has(op.element.id)) {
        refuse(`"${op.element.id}" is already on the board.`);
        continue;
      }
      const bad = checkArrow(op.element, byId);
      if (bad) {
        refuse(bad);
        continue;
      }
      list.push(op.element);
      byId.set(op.element.id, op.element);
      applied.push(op);
      continue;
    }

    const current = byId.get(op.id);
    if (!current) {
      refuse(`"${op.id}" is not on the board.`);
      continue;
    }

    if (op.op === "update") {
      const keys = Object.keys(op.patch);
      const fixed = FIXED_KEYS.find((k) => k in op.patch && op.patch[k] !== current[k]);
      if (fixed) {
        refuse(`"${fixed}" cannot change.`);
        continue;
      }
      if (current.locked && keys.some((k) => k !== "locked")) {
        refuse(`"${op.id}" is locked.`);
        continue;
      }
      const merged: Record<string, unknown> = { ...current };
      for (const [k, v] of Object.entries(op.patch)) {
        if (v === null || v === undefined) delete merged[k];
        else merged[k] = v;
      }
      const next = elementSchema.safeParse(merged);
      if (!next.success) {
        refuse(issue(next.error));
        continue;
      }
      const bad = checkArrow(next.data, byId);
      if (bad) {
        refuse(bad);
        continue;
      }
      list = list.map((e) => (e.id === op.id ? next.data : e));
      byId.set(op.id, next.data);
      applied.push(op);
      continue;
    }

    if (current.locked) {
      refuse(`"${op.id}" is locked.`);
      continue;
    }
    const gone = new Set([op.id]);
    for (const e of list) {
      if (e.type === "arrow" && (e.from === op.id || e.to === op.id)) gone.add(e.id);
    }
    list = list.filter((e) => !gone.has(e.id));
    for (const id of gone) byId.delete(id);
    applied.push(op);
  }

  return { elements: list, applied, refused };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The operations that turn `before` into `after`, by id. The canvas autosaves with these, so
 * a save made on top of someone else's newer version only touches what this person changed.
 * Order: removes of arrows, other removes, adds (arrows last), updates.
 */
export function diffElements(
  before: readonly BoardElement[],
  after: readonly BoardElement[],
): BoardOp[] {
  const old = new Map(before.map((e) => [e.id, e]));
  const now = new Map(after.map((e) => [e.id, e]));
  const removes: BoardOp[] = [];
  const arrowRemoves: BoardOp[] = [];
  for (const e of before) {
    if (!now.has(e.id))
      (e.type === "arrow" ? arrowRemoves : removes).push({ op: "remove", id: e.id });
  }
  const adds: BoardOp[] = [];
  const arrowAdds: BoardOp[] = [];
  const updates: BoardOp[] = [];
  for (const e of after) {
    const prev = old.get(e.id);
    if (!prev) {
      (e.type === "arrow" ? arrowAdds : adds).push({ op: "add", element: e });
      continue;
    }
    if (same(prev, e)) continue;
    const patch: Record<string, unknown> = {};
    const p = prev as Record<string, unknown>;
    const n = e as Record<string, unknown>;
    for (const k of new Set([...Object.keys(p), ...Object.keys(n)])) {
      if (!same(p[k], n[k])) patch[k] = k in n ? n[k] : null;
    }
    updates.push({ op: "update", id: e.id, patch });
  }
  return [...arrowRemoves, ...removes, ...adds, ...arrowAdds, ...updates];
}
