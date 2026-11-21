"use client";

import type { AnnotationColor, AnnotationPayload } from "@thoth/core";
import { cx } from "@thoth/ui";
import { useRef, useState } from "react";
import type { AnnotationDto } from "@/features/annotations/actions";
import { COLORS } from "@/features/annotations/colors";
import { arrowHead, strokePath, thinPoints, VIEW_W, viewH } from "@/features/annotations/geometry";

export type PdfTool = "select" | "pen" | "rect" | "ellipse" | "arrow" | "note";

export const DRAW_TOOLS: readonly PdfTool[] = ["pen", "rect", "ellipse", "arrow"];

/** Ink width as a share of the page width: about 2 pt on a Letter page. */
export const PEN_WIDTH = 0.0035;
const SHAPE_STROKE = 2.5;
const COMMENT_PIN = 14;

type Point = [number, number, number];

type Draft =
  | { type: "ink"; strokes: Point[][] }
  | { type: "shape"; x1: number; y1: number; x2: number; y2: number };

/**
 * One page's annotations, drawn in an SVG whose units are page space × 1000 (ADR-0038).
 * In a drawing tool it also takes pointer input (mouse, trackpad, pen or Apple Pencil with
 * pressure) and hands the finished drawing to `onDraw`.
 */
export function PdfOverlay({
  page,
  ratio,
  annotations,
  tool,
  color,
  onDraw,
}: {
  page: number;
  ratio: number;
  annotations: AnnotationDto[];
  tool: PdfTool;
  color: AnnotationColor;
  onDraw: (payload: AnnotationPayload) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const penSeen = useRef(false);
  const h = viewH(ratio);
  const drawing = DRAW_TOOLS.includes(tool);

  const toPage = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || r.width === 0) return [0, 0];
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return [x, y];
  };
  const pressureOf = (e: PointerEvent | React.PointerEvent) =>
    e.pointerType === "pen" ? Math.max(0.05, e.pressure || 0.5) : 0.5;

  const set = (d: Draft | null) => {
    draftRef.current = d;
    setDraft(d);
  };

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing) return;
    if (e.pointerType === "pen") penSeen.current = true;
    // With a pencil in use, a resting palm or finger does not draw.
    if (e.pointerType === "touch" && penSeen.current) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toPage(e);
    if (tool === "pen") set({ type: "ink", strokes: [[[x, y, pressureOf(e)]]] });
    else set({ type: "shape", x1: x, y1: y, x2: x, y2: y });
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = draftRef.current;
    if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (d.type === "ink") {
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      const stroke = [...(d.strokes[0] ?? [])];
      for (const ev of events) {
        const [x, y] = toPage(ev);
        stroke.push([x, y, pressureOf(ev)]);
      }
      set({ type: "ink", strokes: [stroke] });
    } else {
      const [x, y] = toPage(e);
      set({ ...d, x2: x, y2: y });
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = draftRef.current;
    if (!d) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    set(null);
    if (d.type === "ink") {
      const stroke = thinPoints(d.strokes[0] ?? []);
      if (stroke.length < 2) return;
      onDraw({ type: "ink", page, strokes: [stroke], width: PEN_WIDTH });
    } else {
      // A click with a shape tool is not a shape.
      if (Math.hypot(d.x2 - d.x1, (d.y2 - d.y1) / ratio) < 0.01) return;
      const r = (n: number) => Math.round(n * 10_000) / 10_000;
      const shape = tool === "ellipse" ? "ellipse" : tool === "arrow" ? "arrow" : "rect";
      onDraw({ type: "shape", page, shape, x1: r(d.x1), y1: r(d.y1), x2: r(d.x2), y2: r(d.y2) });
    }
  }

  return (
    <svg
      ref={svg}
      className="pdf-overlay"
      data-drawing={drawing}
      viewBox={`0 0 ${VIEW_W} ${h}`}
      preserveAspectRatio="none"
      aria-hidden={!drawing}
      aria-label={drawing ? `Draw on page ${page}` : undefined}
      role={drawing ? "img" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => set(null)}
    >
      {annotations.map((a) => (
        <AnnotationShape key={a.id} a={a} page={page} ratio={ratio} />
      ))}
      {draft && <DraftShape draft={draft} tool={tool} color={color} ratio={ratio} />}
    </svg>
  );
}

function AnnotationShape({ a, page, ratio }: { a: AnnotationDto; page: number; ratio: number }) {
  const h = viewH(ratio);
  const c = COLORS[a.color];
  const p = a.payload;
  if (p?.type === "ink") {
    return (
      <g data-annotation-id={a.id}>
        {p.strokes.map((s, i) => (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: strokes never reorder
            key={i}
            d={strokePath(s, p.width, ratio)}
            className={c.fill}
          />
        ))}
      </g>
    );
  }
  if (p?.type === "shape") {
    return (
      <g data-annotation-id={a.id}>
        <ShapeLines shape={p} ratio={ratio} className={c.stroke} />
      </g>
    );
  }
  const rects = (a.anchor.rects ?? []).filter((r) => r.page === page);
  if (rects.length === 0) return null;
  const first = rects[0];
  return (
    <g data-annotation-id={a.id}>
      {rects.map((r) => (
        <rect
          key={`${r.x}-${r.y}`}
          x={r.x * VIEW_W}
          y={r.y * h}
          width={r.w * VIEW_W}
          height={r.h * h}
          rx={2}
          className={cx(
            "pdf-highlight",
            c.fill,
            a.kind === "comment" && rects.length === 1 && r.w < 0.03 && "hidden",
          )}
        />
      ))}
      {a.comment && first && (
        <g
          transform={`translate(${Math.min(VIEW_W - COMMENT_PIN, (first.x + (a.kind === "comment" ? 0 : first.w)) * VIEW_W)} ${Math.max(0, first.y * h - COMMENT_PIN / 2)})`}
        >
          <rect width={COMMENT_PIN} height={COMMENT_PIN} rx={3} className={c.fill} />
          <path
            d="M3.5 4.5h7M3.5 7.5h5"
            className="stroke-surface-200"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      )}
    </g>
  );
}

function ShapeLines({
  shape,
  ratio,
  className,
}: {
  shape: { shape: "rect" | "ellipse" | "arrow"; x1: number; y1: number; x2: number; y2: number };
  ratio: number;
  className: string;
}) {
  const h = viewH(ratio);
  const x1 = shape.x1 * VIEW_W;
  const y1 = shape.y1 * h;
  const x2 = shape.x2 * VIEW_W;
  const y2 = shape.y2 * h;
  const common = {
    className,
    fill: "none",
    strokeWidth: SHAPE_STROKE,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (shape.shape === "rect") {
    return (
      <rect
        {...common}
        x={Math.min(x1, x2)}
        y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)}
        height={Math.abs(y2 - y1)}
        rx={3}
      />
    );
  }
  if (shape.shape === "ellipse") {
    return (
      <ellipse
        {...common}
        cx={(x1 + x2) / 2}
        cy={(y1 + y2) / 2}
        rx={Math.abs(x2 - x1) / 2}
        ry={Math.abs(y2 - y1) / 2}
      />
    );
  }
  const [a, b] = arrowHead(x1, y1, x2, y2);
  return (
    <g>
      <line {...common} x1={x1} y1={y1} x2={x2} y2={y2} />
      <path {...common} d={`M${a[0]},${a[1]} L${x2},${y2} L${b[0]},${b[1]}`} />
    </g>
  );
}

function DraftShape({
  draft,
  tool,
  color,
  ratio,
}: {
  draft: Draft;
  tool: PdfTool;
  color: AnnotationColor;
  ratio: number;
}) {
  const c = COLORS[color];
  if (draft.type === "ink") {
    return (
      <path
        d={strokePath(draft.strokes[0] ?? [], PEN_WIDTH, ratio, { last: false })}
        className={c.fill}
      />
    );
  }
  const shape = tool === "ellipse" ? "ellipse" : tool === "arrow" ? "arrow" : "rect";
  return <ShapeLines shape={{ ...draft, shape }} ratio={ratio} className={c.stroke} />;
}

export type { Point as InkPoint };
