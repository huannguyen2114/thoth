"use client";

import {
  type BoardElement,
  type Box,
  boardBounds,
  elementBox,
  parseCitations,
  unionBox,
} from "@thoth/core";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Command, useCommands } from "@/app/_components/commands";
import { ContextMenu, type MenuItem } from "./context-menu";
import { ArrowsLayer, ElementView } from "./element-view";
import {
  type AddKind,
  clampZoom,
  cloneElements,
  fitBox,
  hitTest,
  idsInArea,
  newElement,
  newElementId,
  type Point,
  routeArrow,
  snap,
  textOf,
  toBoard,
  type Viewport,
  zoomAt,
} from "./model";
import { CanvasToolbar, type Tool, ZoomControls } from "./toolbar";
import type { BoardState } from "./use-board";

/** Height of the floating toolbar, kept clear when fitting. */
const TOOLBAR_INSET = 56;

/** One clipboard for every board in this tab. */
let clipboard: BoardElement[] = [];

type Gesture =
  | { kind: "pan"; start: Point; origin: Viewport }
  | {
      kind: "move";
      start: Point;
      ids: string[];
      before: BoardElement[];
      moved: boolean;
    }
  | { kind: "resize"; id: string; handle: string; start: Point; box: Box; before: BoardElement[] }
  | { kind: "marquee"; start: Point; now: Point; base: string[] }
  | { kind: "connect"; from: string; now: Point; over: string | null }
  | { kind: "pinch"; dist: number; mid: Point; origin: Viewport };

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA");

export interface CanvasProps {
  state: BoardState;
  selected: string[];
  setSelected: (ids: string[]) => void;
  readOnly: boolean;
  onCite?: ((token: string) => void) | undefined;
  onLinkSource: (ids: string[]) => void;
  contentId: string;
  /** Extra room at the bottom for the composer, so "zoom to fit" keeps content above it. */
  bottomInset: number;
}

export function BoardCanvas({
  state,
  selected,
  setSelected,
  readOnly,
  onCite,
  onLinkSource,
  contentId,
  bottomInset,
}: CanvasProps) {
  const { elements, change, commit, undo, redo, fresh } = state;
  const root = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>({ x: 48, y: 48, zoom: 1 });
  const [glide, setGlide] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [editing, setEditing] = useState<string | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [space, setSpace] = useState(false);
  const [active, setActive] = useState(false);
  const [menu, setMenu] = useState<{ at: Point; ids: string[] } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const pointers = useRef(new Map<number, Point>());
  const viewRef = useRef(view);
  viewRef.current = view;
  const gestureRef = useRef(gesture);
  gestureRef.current = gesture;

  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Panel size, for zoom to fit and the phone layout.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const moveView = useCallback((next: Viewport, animate = false) => {
    setGlide(animate);
    setView(next);
    if (animate) window.setTimeout(() => setGlide(false), 320);
  }, []);

  const fitTo = useCallback(
    (box: Box | null, animate = true) => {
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Keep clear of the toolbar (top) and the composer (bottom).
      const top = readOnly ? 0 : r.width < 560 ? TOOLBAR_INSET * 2 : TOOLBAR_INSET;
      const v = fitBox(box, r.width, Math.max(120, r.height - bottomInset - top), 32, 1);
      moveView({ ...v, y: v.y + top }, animate);
    },
    [bottomInset, moveView, readOnly],
  );
  const zoomToFit = useCallback(() => fitTo(boardBounds(elements)), [elements, fitTo]);

  // First view of a board: fit it.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || size.w === 0 || size.h === 0) return;
    fitted.current = true;
    fitTo(boardBounds(elements), false);
  }, [elements, fitTo, size.w, size.h]);

  // Claude's changes: select them and bring them into view, once per batch.
  const latest = useRef({ byId, fitTo, setSelected, bottomInset });
  latest.current = { byId, fitTo, setSelected, bottomInset };
  useEffect(() => {
    const { byId, fitTo, setSelected, bottomInset } = latest.current;
    if (!fresh || fresh.ids.length === 0) return;
    setSelected(fresh.ids.filter((id) => byId.get(id)?.type !== "arrow"));
    const box = unionBox(
      fresh.ids.map((id) => {
        const e = byId.get(id);
        return e ? elementBox(e) : null;
      }),
    );
    const el = root.current;
    if (!box || !el) return;
    const r = el.getBoundingClientRect();
    const v = viewRef.current;
    const visible =
      box.x * v.zoom + v.x >= 0 &&
      box.y * v.zoom + v.y >= 0 &&
      (box.x + box.w) * v.zoom + v.x <= r.width &&
      (box.y + box.h) * v.zoom + v.y <= r.height - bottomInset;
    if (!visible) fitTo(unionBox([box, boardBounds([...byId.values()])]));
  }, [fresh]);

  const freshOrder = useMemo(() => {
    const m = new Map<string, number>();
    if (fresh && Date.now() - fresh.at < 4000)
      for (const [i, id] of fresh.ids.entries()) m.set(id, i);
    return m;
  }, [fresh]);

  const screenPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = root.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const boardPoint = (e: { clientX: number; clientY: number }) =>
    toBoard(viewRef.current, screenPoint(e));
  const viewCentre = useCallback((): Point => {
    const r = root.current?.getBoundingClientRect();
    return toBoard(viewRef.current, {
      x: (r?.width ?? 600) / 2,
      y: Math.max(80, ((r?.height ?? 400) - bottomInset) / 2),
    });
  }, [bottomInset]);

  // Wheel: two-finger scroll pans; pinch (ctrl + wheel) or Cmd/Ctrl + wheel zooms.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
      setGlide(false);
      const r = el.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025) * 2);
        setView((v) => zoomAt(v, at, factor));
      } else {
        const k = e.deltaMode === 1 ? 16 : 1;
        setView((v) => ({ ...v, x: v.x - e.deltaX * k, y: v.y - e.deltaY * k }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- Editing helpers -------------------------------------------------------------------

  const addElement = useCallback(
    (kind: AddKind, at?: Point) => {
      const el = newElement(kind, at ?? viewCentre());
      change((els) => (kind === "section" ? [el, ...els] : [...els, el]));
      setSelected([el.id]);
      setTool("select");
      if (kind !== "section") setEditing(el.id);
      root.current?.focus();
    },
    [change, setSelected, viewCentre],
  );

  const removeSelected = useCallback(() => {
    if (selected.length === 0) return;
    const gone = new Set(selected.filter((id) => !byId.get(id)?.locked));
    change((els) =>
      els.filter(
        (e) => !gone.has(e.id) && !(e.type === "arrow" && (gone.has(e.from) || gone.has(e.to))),
      ),
    );
    setSelected([]);
  }, [byId, change, selected, setSelected]);

  const copy = useCallback(() => {
    const picked = new Set(selected);
    clipboard = elements.filter((e) => picked.has(e.id));
  }, [elements, selected]);

  const paste = useCallback(
    (items: BoardElement[] = clipboard) => {
      if (items.length === 0) return;
      const copies = cloneElements(items);
      change((els) => [...els, ...copies]);
      setSelected(copies.map((c) => c.id));
      clipboard = copies;
    },
    [change, setSelected],
  );

  const commitText = useCallback(
    (id: string, text: string) => {
      setEditing(null);
      root.current?.focus();
      const el = byId.get(id);
      const t = el && textOf(el);
      if (!el || !t) return;
      // A new, still empty text or shape that was never written in disappears.
      if (!text.trim() && el.type === "text") {
        change((els) => els.filter((e) => e.id !== id));
        return;
      }
      if (t.value === text) return;
      // Rewording makes an element the person's own (Claude will then leave it alone).
      change((els) =>
        els.map((e) =>
          e.id === id
            ? ({
                ...e,
                [t.field]: t.field === "label" && !text ? undefined : text,
                by: "person",
              } as BoardElement)
            : e,
        ),
      );
    },
    [byId, change],
  );

  const setColor = useCallback(
    (ids: string[], color: string) => {
      const pick = new Set(ids);
      change((els) =>
        els.map((e) => {
          if (!pick.has(e.id) || !("color" in e)) return e;
          if (e.type === "text" || e.type === "arrow") return e;
          return { ...e, color } as BoardElement;
        }),
      );
    },
    [change],
  );

  const nudge = (dx: number, dy: number) => {
    const pick = new Set(selected);
    change((els) =>
      els.map((e) =>
        pick.has(e.id) && "x" in e && !e.locked
          ? ({ ...e, x: e.x + dx, y: e.y + dy } as BoardElement)
          : e,
      ),
    );
  };

  // ---- Keyboard: app-level shortcuts through the command registry -------------------------

  const shortcuts = useMemo<Command[]>(
    () =>
      active && !editing
        ? [
            {
              id: "wb-undo",
              group: "Whiteboard",
              label: "Undo on the whiteboard",
              shortcut: "mod+z",
              run: undo,
            },
            {
              id: "wb-redo",
              group: "Whiteboard",
              label: "Redo on the whiteboard",
              shortcut: "mod+shift+z",
              run: redo,
            },
            ...(readOnly
              ? []
              : [
                  {
                    id: "wb-copy",
                    group: "Whiteboard",
                    label: "Copy selection",
                    shortcut: "mod+c",
                    run: copy,
                  },
                  {
                    id: "wb-cut",
                    group: "Whiteboard",
                    label: "Cut selection",
                    shortcut: "mod+x",
                    run: () => {
                      copy();
                      removeSelected();
                    },
                  },
                  {
                    id: "wb-paste",
                    group: "Whiteboard",
                    label: "Paste",
                    shortcut: "mod+v",
                    run: () => paste(),
                  },
                  {
                    id: "wb-duplicate",
                    group: "Whiteboard",
                    label: "Duplicate selection",
                    shortcut: "mod+d",
                    run: () => paste(elements.filter((e) => selectedSet.has(e.id))),
                  },
                  {
                    id: "wb-select-all",
                    group: "Whiteboard",
                    label: "Select everything on the board",
                    shortcut: "mod+a",
                    run: () => setSelected(elements.map((e) => e.id)),
                  },
                ]),
            {
              id: "wb-fit",
              group: "Whiteboard",
              label: "Zoom to fit",
              shortcut: "mod+0",
              run: zoomToFit,
            },
            {
              id: "wb-zoom-in",
              group: "Whiteboard",
              label: "Zoom in",
              shortcut: "mod+=",
              run: () =>
                moveView(zoomAt(viewRef.current, { x: size.w / 2, y: size.h / 2 }, 1.25), true),
            },
            {
              id: "wb-zoom-out",
              group: "Whiteboard",
              label: "Zoom out",
              shortcut: "mod+-",
              run: () =>
                moveView(zoomAt(viewRef.current, { x: size.w / 2, y: size.h / 2 }, 0.8), true),
            },
          ]
        : [],
    [
      active,
      editing,
      undo,
      redo,
      readOnly,
      copy,
      removeSelected,
      paste,
      elements,
      selectedSet,
      setSelected,
      zoomToFit,
      moveView,
      size,
    ],
  );
  useCommands("Whiteboard", shortcuts);

  // Board-local keys (not app-level): they only fire while the canvas itself has focus.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isEditable(e.target)) return;
    const step = e.shiftKey ? 24 : 8;
    if (e.key === " ") {
      e.preventDefault();
      setSpace(true);
      return;
    }
    if (e.key === "Escape") {
      if (menu) setMenu(null);
      else if (tool !== "select") setTool("select");
      else setSelected([]);
      return;
    }
    if (readOnly || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeSelected();
    } else if (e.key === "Enter" && selected.length === 1) {
      e.preventDefault();
      const el = byId.get(selected[0] as string);
      if (el && textOf(el) && !el.locked) setEditing(el.id);
    } else if (e.key.startsWith("Arrow") && selected.length > 0) {
      e.preventDefault();
      const d = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }[e.key] as [number, number];
      nudge(d[0], d[1]);
    } else {
      const k = e.key.toLowerCase();
      const tools: Record<string, Tool> = { v: "select", h: "hand", a: "arrow" };
      const adds: Record<string, AddKind> = { r: "shape", s: "sticky", t: "text", g: "section" };
      if (tools[k]) setTool(tools[k]);
      else if (adds[k]) {
        e.preventDefault();
        addElement(adds[k]);
      }
    }
  };

  // ---- Pointer gestures ---------------------------------------------------------------------

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return; // the context menu handles right-click
    const target = e.target as HTMLElement;
    if (target.closest(".wb-float, .menu, .wb-badge, .wb-editor")) return;
    root.current?.focus({ preventScroll: true });
    setMenu(null);
    const p = screenPoint(e);
    pointers.current.set(e.pointerId, p);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      setGesture({
        kind: "pinch",
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        origin: viewRef.current,
      });
      return;
    }

    const bp = toBoard(viewRef.current, p);
    const panning =
      e.button === 1 || space || tool === "hand" || (readOnly && e.pointerType !== "mouse");
    if (panning) {
      setGesture({ kind: "pan", start: p, origin: viewRef.current });
      return;
    }

    const handle = target.closest<HTMLElement>("[data-handle]");
    const connect = target.closest<HTMLElement>("[data-connect]");
    const hit = target.closest<HTMLElement>("[data-el-id]");
    const id = hit?.dataset.elId ?? null;
    const el = id ? byId.get(id) : undefined;

    if (!readOnly && connect && id) {
      setGesture({ kind: "connect", from: id, now: bp, over: null });
      return;
    }
    if (!readOnly && tool === "arrow" && el && el.type !== "arrow") {
      setGesture({ kind: "connect", from: el.id, now: bp, over: null });
      return;
    }
    if (!readOnly && handle && el) {
      const box = elementBox(el);
      if (box) {
        setGesture({
          kind: "resize",
          id: el.id,
          handle: handle.dataset.handle ?? "se",
          start: bp,
          box,
          before: elements,
        });
      }
      return;
    }
    if (el) {
      let next = selected;
      if (e.shiftKey) {
        next = selectedSet.has(el.id) ? selected.filter((s) => s !== el.id) : [...selected, el.id];
      } else if (!selectedSet.has(el.id)) {
        next = [el.id];
      }
      setSelected(next);
      if (readOnly || el.type === "arrow") return;
      const ids = next.filter((s) => {
        const x = byId.get(s);
        return x && x.type !== "arrow" && !x.locked;
      });
      // Moving a section carries what is inside it.
      for (const s of [...ids]) {
        const sec = byId.get(s);
        const sb = sec?.type === "section" ? elementBox(sec) : null;
        if (!sb) continue;
        for (const o of elements) {
          const ob = elementBox(o);
          if (o.id !== s && ob && o.type !== "section" && !o.locked && !ids.includes(o.id)) {
            if (
              ob.x >= sb.x &&
              ob.y >= sb.y &&
              ob.x + ob.w <= sb.x + sb.w &&
              ob.y + ob.h <= sb.y + sb.h
            )
              ids.push(o.id);
          }
        }
      }
      if (ids.length) setGesture({ kind: "move", start: bp, ids, before: elements, moved: false });
      return;
    }
    // Empty canvas: a touch pans, a mouse draws a marquee.
    if (e.pointerType === "touch") {
      setGesture({ kind: "pan", start: p, origin: viewRef.current });
      if (!e.shiftKey) setSelected([]);
      return;
    }
    setGesture({ kind: "marquee", start: bp, now: bp, base: e.shiftKey ? selected : [] });
    if (!e.shiftKey) setSelected([]);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!pointers.current.has(e.pointerId) || !g) return;
    const p = screenPoint(e);
    pointers.current.set(e.pointerId, p);
    const bp = toBoard(viewRef.current, p);
    switch (g.kind) {
      case "pinch": {
        const [a, b] = [...pointers.current.values()] as [Point, Point];
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const zoomed = zoomAt(g.origin, g.mid, dist / (g.dist || 1));
        setView({ ...zoomed, x: zoomed.x + mid.x - g.mid.x, y: zoomed.y + mid.y - g.mid.y });
        return;
      }
      case "pan":
        setView({ ...g.origin, x: g.origin.x + p.x - g.start.x, y: g.origin.y + p.y - g.start.y });
        return;
      case "marquee":
        setGesture({ ...g, now: bp });
        {
          const area = {
            x: Math.min(g.start.x, bp.x),
            y: Math.min(g.start.y, bp.y),
            w: Math.abs(bp.x - g.start.x),
            h: Math.abs(bp.y - g.start.y),
          };
          setSelected([...new Set([...g.base, ...idsInArea(elements, area)])]);
        }
        return;
      case "connect": {
        const over = hitTest(elements, bp);
        setGesture({
          ...g,
          now: bp,
          over: over && over.id !== g.from && over.type !== "arrow" ? over.id : null,
        });
        return;
      }
      case "move": {
        const dx = snap(bp.x - g.start.x);
        const dy = snap(bp.y - g.start.y);
        if (!g.moved && Math.hypot(bp.x - g.start.x, bp.y - g.start.y) * viewRef.current.zoom < 3)
          return;
        if (!g.moved) setGesture({ ...g, moved: true });
        const pick = new Set(g.ids);
        const orig = new Map(g.before.map((x) => [x.id, x]));
        change(
          (els) =>
            els.map((x) => {
              const o = orig.get(x.id);
              return pick.has(x.id) && o && "x" in o
                ? ({ ...x, x: o.x + dx, y: o.y + dy } as BoardElement)
                : x;
            }),
          false,
        );
        return;
      }
      case "resize": {
        const dx = bp.x - g.start.x;
        const dy = bp.y - g.start.y;
        const b = g.box;
        let { x, y, w, h } = b;
        if (g.handle.includes("e")) w = b.w + dx;
        if (g.handle.includes("w")) {
          w = b.w - dx;
          x = b.x + dx;
        }
        if (g.handle.includes("s")) h = b.h + dy;
        if (g.handle.includes("n")) {
          h = b.h - dy;
          y = b.y + dy;
        }
        const min = 24;
        if (w < min) {
          if (g.handle.includes("w")) x = b.x + b.w - min;
          w = min;
        }
        if (h < min) {
          if (g.handle.includes("n")) y = b.y + b.h - min;
          h = min;
        }
        const next = {
          x: snap(x),
          y: snap(y),
          w: Math.max(min, snap(w)),
          h: Math.max(min, snap(h)),
        };
        change(
          (els) =>
            els.map((el) => {
              if (el.id !== g.id) return el;
              if (el.type === "text") return { ...el, wrap: next.w };
              return { ...el, ...next } as BoardElement;
            }),
          false,
        );
        return;
      }
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === "pinch") {
      // Lifting one finger of a pinch ends it; the other finger does nothing until lifted.
      setGesture(null);
      return;
    }
    if (pointers.current.size > 0) return;
    setGesture(null);
    if (g.kind === "move" && g.moved) commit(g.before);
    if (g.kind === "resize") commit(g.before);
    if (g.kind === "connect" && g.over) {
      const arrow: BoardElement = {
        id: newElementId(),
        type: "arrow",
        by: "person",
        from: g.from,
        to: g.over,
        color: "ink",
      };
      change((els) => [...els, arrow]);
      setSelected([arrow.id]);
      if (tool === "arrow") setTool("select");
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    // The canvas holds pointer capture, so the event's target is the canvas itself: look up
    // what is really under the pointer (arrows included), then fall back to a hit test.
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target.closest(".wb-float, .menu, .wb-badge, .wb-editor")) return;
    const id = target.closest<HTMLElement>("[data-el-id]")?.dataset.elId;
    const el = (id ? byId.get(id) : undefined) ?? hitTest(elements, boardPoint(e)) ?? undefined;
    if (el && textOf(el) && !el.locked) {
      setSelected([el.id]);
      setEditing(el.id);
      return;
    }
    if (!el) addElement("text", boardPoint(e));
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return;
    const target = e.target as HTMLElement;
    if (target.closest(".wb-float, .menu")) return;
    e.preventDefault();
    const id = target.closest<HTMLElement>("[data-el-id]")?.dataset.elId;
    let ids = selected;
    if (id && !selectedSet.has(id)) {
      ids = [id];
      setSelected(ids);
    }
    setMenu({ at: screenPoint(e), ids: id || ids.length ? ids : [] });
  };

  // Drop a citation (from notes, chat or any text with "[p.3]") to make a linked sticky.
  const onDragOver = (e: React.DragEvent) => {
    if (!readOnly && e.dataTransfer.types.includes("text/plain")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    const text = e.dataTransfer.getData("text/plain").trim();
    if (!text) return;
    e.preventDefault();
    const at = boardPoint(e);
    const token = parseCitations(text)[0]?.raw;
    const body = token ? text.replace(token, "").replace(/\s+/g, " ").trim() : text;
    const sticky = newElement("sticky", at);
    const el = {
      ...sticky,
      text: body.slice(0, 400) || (token ? `See ${token.slice(1, -1)}` : ""),
      ...(token ? { source: { contentId, token } } : {}),
    } as BoardElement;
    change((els) => [...els, el]);
    setSelected([el.id]);
    root.current?.focus();
  };

  // Release space-to-pan anywhere.
  useEffect(() => {
    if (!space) return;
    const up = (e: KeyboardEvent) => e.key === " " && setSpace(false);
    const blur = () => setSpace(false);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [space]);

  const menuItems = (ids: string[]): MenuItem[] => {
    const els = ids.map((id) => byId.get(id)).filter((x): x is BoardElement => Boolean(x));
    const one = els.length === 1 ? els[0] : undefined;
    const items: MenuItem[] = [];
    if (one && textOf(one) && !one.locked) {
      items.push({ id: "edit", label: "Edit text", hint: "Enter", run: () => setEditing(one.id) });
    }
    if (els.length && els.every((x) => x.type !== "arrow")) {
      items.push({ id: "link", label: "Link to source…", run: () => onLinkSource(ids) });
    }
    if (els.some((x) => x.source)) {
      items.push({
        id: "unlink",
        label: "Remove source link",
        run: () =>
          change((all) =>
            all.map((x) => {
              if (!ids.includes(x.id) || !x.source) return x;
              const { source: _drop, ...rest } = x;
              return rest as BoardElement;
            }),
          ),
      });
    }
    if (els.some((x) => x.type === "shape" || x.type === "sticky" || x.type === "section")) {
      items.push({
        id: "colors",
        kind: "colors",
        label: "Colour",
        run: () => {},
        onColor: (c) => setColor(ids, c),
      });
    }
    if (els.length) {
      items.push({ id: "sep", kind: "sep", label: "", run: () => {} });
      items.push({ id: "dup", label: "Duplicate", hint: "⌘D", run: () => paste(els) });
      items.push({ id: "del", label: "Delete", hint: "⌫", danger: true, run: removeSelected });
    } else {
      items.push({
        id: "shape",
        label: "Add shape",
        run: () => addElement("shape", menu ? toBoard(view, menu.at) : undefined),
      });
      items.push({
        id: "sticky",
        label: "Add sticky",
        run: () => addElement("sticky", menu ? toBoard(view, menu.at) : undefined),
      });
      items.push({
        id: "text",
        label: "Add text",
        run: () => addElement("text", menu ? toBoard(view, menu.at) : undefined),
      });
      if (clipboard.length)
        items.push({ id: "paste", label: "Paste", hint: "⌘V", run: () => paste() });
    }
    return items;
  };

  const connectFrom = gesture?.kind === "connect" ? byId.get(gesture.from) : undefined;
  const connectBox = connectFrom ? elementBox(connectFrom) : null;
  const marquee =
    gesture?.kind === "marquee"
      ? {
          x: Math.min(gesture.start.x, gesture.now.x),
          y: Math.min(gesture.start.y, gesture.now.y),
          w: Math.abs(gesture.now.x - gesture.start.x),
          h: Math.abs(gesture.now.y - gesture.start.y),
        }
      : null;
  const grid = 24 * view.zoom;
  const single = selected.length === 1 ? selected[0] : undefined;
  const sections = elements.filter((e) => e.type === "section");
  const others = elements.filter((e) => e.type !== "section" && e.type !== "arrow");
  const renderEl = (el: BoardElement) =>
    el.type === "arrow" ? null : (
      <ElementView
        key={el.id}
        el={el}
        selected={selectedSet.has(el.id)}
        handles={single === el.id && !gesture}
        editing={editing === el.id}
        enter={freshOrder.get(el.id) ?? -1}
        dropTarget={gesture?.kind === "connect" && gesture.over === el.id}
        readOnly={readOnly}
        onCite={onCite}
        onCommitText={commitText}
      />
    );
  const editingArrow = editing ? byId.get(editing) : undefined;
  const arrowRoute =
    editingArrow?.type === "arrow"
      ? (() => {
          const a = byId.get(editingArrow.from);
          const b = byId.get(editingArrow.to);
          const ab = a && elementBox(a);
          const bb = b && elementBox(b);
          return ab && bb ? routeArrow(ab, bb) : null;
        })()
      : null;

  return (
    <div
      ref={root}
      className="wb"
      role="application"
      aria-label="Whiteboard canvas"
      aria-roledescription="whiteboard"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas is a keyboard-operable application region
      tabIndex={0}
      data-tool={tool}
      data-panning={space}
      data-dragging={gesture?.kind}
      style={{
        backgroundSize: `${grid}px ${grid}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onFocus={() => setActive(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(false);
      }}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.key === " " && setSpace(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className="wb-layer"
        data-glide={glide}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        {sections.map(renderEl)}
        <ArrowsLayer
          elements={elements}
          byId={byId}
          selected={selectedSet}
          fresh={freshOrder}
          preview={
            connectBox && gesture?.kind === "connect"
              ? {
                  from: connectBox,
                  to: gesture.over
                    ? (() => {
                        const o = byId.get(gesture.over);
                        const ob = o && elementBox(o);
                        return ob ? { x: ob.x + ob.w / 2, y: ob.y + ob.h / 2 } : gesture.now;
                      })()
                    : gesture.now,
                }
              : null
          }
        />
        {others.map(renderEl)}
        {arrowRoute && editingArrow?.type === "arrow" && (
          <input
            // biome-ignore lint/a11y/noAutofocus: editing starts on a double-click
            autoFocus
            aria-label="Arrow label"
            defaultValue={editingArrow.label ?? ""}
            className="wb-arrow-label wb-editor"
            style={{
              left: arrowRoute.mid.x,
              top: arrowRoute.mid.y,
              position: "absolute",
              inset: "auto",
              width: 140,
              textAlign: "center",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
            onBlur={(e) => commitText(editingArrow.id, e.currentTarget.value.trim())}
          />
        )}
        {marquee && (
          <div
            className="wb-marquee"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}
      </div>

      {elements.length === 0 && !state.run && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
          <div className="max-w-xs">
            <p className="type-heading-3 text-ink">An empty board</p>
            <p className="mt-1 text-ink-muted">
              {readOnly
                ? "Ask Claude below to draw an explanation."
                : "Add a shape from the toolbar, or ask Claude below to draw an explanation."}
            </p>
          </div>
        </div>
      )}

      {!readOnly && (
        <CanvasToolbar
          tool={tool}
          setTool={setTool}
          onAdd={(k) => addElement(k)}
          canUndo={state.canUndo}
          canRedo={state.canRedo}
          onUndo={undo}
          onRedo={redo}
        />
      )}
      <ZoomControls
        zoom={view.zoom}
        bottom={bottomInset}
        onZoom={(f) => moveView(zoomAt(view, { x: size.w / 2, y: size.h / 2 }, f), true)}
        onReset={() =>
          moveView(
            {
              ...zoomAt(view, { x: size.w / 2, y: size.h / 2 }, 1 / view.zoom),
              zoom: clampZoom(1),
            },
            true,
          )
        }
        onFit={zoomToFit}
      />

      {menu && (
        <ContextMenu
          at={menu.at}
          items={menuItems(menu.ids)}
          onClose={() => {
            setMenu(null);
            root.current?.focus();
          }}
        />
      )}
    </div>
  );
}
