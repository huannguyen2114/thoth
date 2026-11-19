"use client";

import { type BoardElement, type Box, elementBox, TABLE_COL_W } from "@thoth/core";
import { cx } from "@thoth/ui";
import { type CSSProperties, memo, useEffect, useRef } from "react";
import { badgeLabel, type Point, roundedPath, routeArrow, textOf } from "./model";

type BoxEl = Exclude<BoardElement, { type: "arrow" }>;

function ShapeOutline({ kind, w, h }: { kind: string; w: number; h: number }) {
  const common = {
    fill: "var(--wb-fill)",
    stroke: "var(--wb-edge)",
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke" as const,
  };
  const i = 0.75;
  let shape: React.ReactNode;
  switch (kind) {
    case "ellipse":
      shape = <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - i} ry={h / 2 - i} {...common} />;
      break;
    case "diamond":
      shape = (
        <polygon
          points={`${w / 2},${i} ${w - i},${h / 2} ${w / 2},${h - i} ${i},${h / 2}`}
          strokeLinejoin="round"
          {...common}
        />
      );
      break;
    default: {
      const r = kind === "rect" ? 6 : kind === "pill" ? h / 2 : 16;
      shape = (
        <rect
          x={i}
          y={i}
          width={w - i * 2}
          height={h - i * 2}
          rx={Math.min(r, h / 2)}
          {...common}
        />
      );
    }
  }
  return (
    <svg className="absolute inset-0 overflow-visible" width={w} height={h} aria-hidden="true">
      {shape}
    </svg>
  );
}

/** Text editing in place: a textarea over the element, committed on blur or Escape. */
function InlineEditor({
  value,
  className,
  onCommit,
}: {
  value: string;
  className: string;
  onCommit: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onCommit(ref.current?.value ?? value);
  };
  return (
    <textarea
      ref={ref}
      defaultValue={value}
      aria-label="Edit text"
      className={cx("wb-editor", className)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          finish();
        }
      }}
      onBlur={finish}
    />
  );
}

export interface ElementViewProps {
  el: BoxEl;
  selected: boolean;
  /** Only one selected element shows resize and connect handles. */
  handles: boolean;
  editing: boolean;
  /** Position in the stagger of Claude's new elements, or -1. */
  enter: number;
  dropTarget: boolean;
  readOnly: boolean;
  onCite?: ((token: string) => void) | undefined;
  onCommitText: (id: string, text: string) => void;
}

const sizeClass = (s: string) => `wb-size-${s}`;

export const ElementView = memo(function ElementView({
  el,
  selected,
  handles,
  editing,
  enter,
  dropTarget,
  readOnly,
  onCite,
  onCommitText,
}: ElementViewProps) {
  const box = elementBox(el) as Box;
  const style: CSSProperties = {
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    ...(enter >= 0 ? { animationDelay: `${Math.min(enter, 24) * 30}ms` } : {}),
  };
  const fill = "color" in el && el.type !== "text" ? `wb-fill-${el.color}` : "";

  let body: React.ReactNode = null;
  let textClass = "";
  switch (el.type) {
    case "shape":
      textClass = cx("wb-text wb-text--centre", sizeClass(el.size));
      body = (
        <>
          <ShapeOutline kind={el.kind} w={box.w} h={box.h} />
          {!editing && <div className={textClass}>{el.text}</div>}
        </>
      );
      break;
    case "sticky":
      textClass = "wb-text wb-text--sticky wb-size-body";
      body = !editing && <div className={textClass}>{el.text}</div>;
      break;
    case "text":
      textClass = cx("wb-text", sizeClass(el.size));
      body = !editing && (
        <div className={textClass} style={{ color: `var(--wb-ink-${el.color})` }}>
          {el.text || (selected ? "" : " ")}
        </div>
      );
      break;
    case "section":
      textClass = "wb-section__title";
      body = !editing && <div className={textClass}>{el.title}</div>;
      break;
    case "table": {
      const cols = Math.max(...el.rows.map((r) => r.length), 1);
      const widths = Array.from({ length: cols }, (_, i) => el.colWidths?.[i] ?? TABLE_COL_W);
      body = (
        <table className="wb-table" style={{ width: box.w }}>
          <colgroup>
            {widths.map((w, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity of their own
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <tbody>
            {el.rows.map((row, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => {
                  const Cell = r === 0 ? "th" : "td";
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells have no identity of their own
                  return <Cell key={c}>{row[c] ?? ""}</Cell>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
      break;
    }
    case "image":
      body = (
        // biome-ignore lint/performance/noImgElement: an inline SVG drawing, not a photo
        <img src={el.svg} alt="" className="pointer-events-none absolute inset-0 size-full" />
      );
      break;
  }

  const editable = textOf(el);
  return (
    <div
      data-el-id={el.id}
      data-selected={selected}
      data-handles={handles}
      data-locked={el.locked ? "true" : undefined}
      className={cx(
        "wb-el",
        fill,
        el.type === "section" && "wb-section",
        el.type === "sticky" && "wb-sticky",
        enter >= 0 && "wb-enter",
        dropTarget && "wb-drop-target",
      )}
      style={style}
    >
      {body}
      {editing && editable && (
        <InlineEditor
          value={editable.value}
          className={el.type === "section" ? "wb-section__title wb-size-small" : textClass}
          onCommit={(t) => onCommitText(el.id, t)}
        />
      )}
      {(selected || dropTarget) && <div className="wb-selected" />}
      {el.source && onCite && (
        <button
          type="button"
          className="wb-badge badge badge--accent"
          title={`Show ${badgeLabel(el.source.token)} in the source`}
          aria-label={`Show ${badgeLabel(el.source.token)} in the source`}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (el.source) onCite(el.source.token);
          }}
        >
          {badgeLabel(el.source.token)}
        </button>
      )}
      {handles &&
        !readOnly &&
        !el.locked &&
        (el.type !== "text" && el.type !== "table" ? (
          (["nw", "ne", "se", "sw"] as const).map((h) => (
            <span
              key={h}
              data-handle={h}
              className="wb-handle"
              style={{
                left: h.includes("w") ? 0 : "100%",
                top: h.includes("n") ? 0 : "100%",
                cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize",
              }}
            />
          ))
        ) : el.type === "text" ? (
          <span
            data-handle="e"
            className="wb-handle"
            style={{ left: "100%", top: "50%", cursor: "ew-resize" }}
          />
        ) : null)}
      {!readOnly &&
        el.type !== "section" &&
        !editing &&
        (["top", "right", "bottom", "left"] as const).map((side) => (
          <span
            key={side}
            data-connect={side}
            className="wb-connect"
            title="Drag to connect"
            style={{
              left: side === "left" ? -14 : side === "right" ? "calc(100% + 14px)" : "50%",
              top: side === "top" ? -14 : side === "bottom" ? "calc(100% + 14px)" : "50%",
            }}
          />
        ))}
    </div>
  );
});

const ARROW_HEAD = "wb-arrowhead";

/** All arrows, as right-angle connectors in one SVG, plus their labels as DOM text. */
export function ArrowsLayer({
  elements,
  byId,
  selected,
  fresh,
  preview,
}: {
  elements: readonly BoardElement[];
  byId: Map<string, BoardElement>;
  selected: ReadonlySet<string>;
  fresh: ReadonlyMap<string, number>;
  preview: { from: Box; to: Point } | null;
}) {
  const arrows = elements.filter(
    (e): e is Extract<BoardElement, { type: "arrow" }> => e.type === "arrow",
  );
  const routes = arrows.flatMap((a) => {
    const from = byId.get(a.from);
    const to = byId.get(a.to);
    const fb = from && elementBox(from);
    const tb = to && elementBox(to);
    if (!fb || !tb) return [];
    return [{ a, route: routeArrow(fb, tb) }];
  });
  return (
    <>
      <svg
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        width={1}
        height={1}
        aria-hidden="true"
      >
        <defs>
          {(["ink", "terracotta", "blue", "green", "purple", "accent"] as const).map((c) => (
            <marker
              key={c}
              id={`${ARROW_HEAD}-${c}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path
                d="M1,1 L9,5 L1,9"
                fill="none"
                stroke={c === "accent" ? "var(--accent)" : `var(--wb-ink-${c})`}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          ))}
        </defs>
        {routes.map(({ a, route }) => {
          const d = roundedPath(route.points);
          const on = selected.has(a.id);
          const enter = fresh.get(a.id);
          const colour = on ? "var(--accent)" : `var(--wb-ink-${a.color})`;
          return (
            <g key={a.id}>
              {/* A wide, invisible stroke makes the arrow easy to click. */}
              <path
                d={d}
                data-el-id={a.id}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: "stroke" }}
              />
              <path
                d={d}
                fill="none"
                stroke={colour}
                strokeOpacity={on ? 1 : 0.7}
                strokeWidth={on ? 2 : 1.5}
                strokeDasharray={a.dash ? "6 5" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd={`url(#${ARROW_HEAD}-${on ? "accent" : a.color})`}
                className={enter !== undefined && !a.dash ? "wb-enter-path" : undefined}
                style={
                  enter !== undefined
                    ? ({
                        animationDelay: `${Math.min(enter, 24) * 30 + 150}ms`,
                        "--wb-len": `${pathLength(route.points)}`,
                      } as CSSProperties)
                    : undefined
                }
              />
            </g>
          );
        })}
        {preview && (
          <path
            d={roundedPath(
              routeArrow(preview.from, { x: preview.to.x - 1, y: preview.to.y - 1, w: 2, h: 2 })
                .points,
            )}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            markerEnd={`url(#${ARROW_HEAD}-accent)`}
          />
        )}
      </svg>
      {routes.map(({ a, route }) =>
        a.label ? (
          <div
            key={a.id}
            className="wb-arrow-label"
            style={{ left: route.mid.x, top: route.mid.y }}
          >
            {a.label}
          </div>
        ) : null,
      )}
    </>
  );
}

function pathLength(points: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return Math.ceil(len) + 10;
}
