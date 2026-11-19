"use client";

import type { ReactNode } from "react";
import { formatShortcut } from "@/app/_components/commands";
import type { AddKind } from "./model";

export type Tool = "select" | "hand" | "arrow";

const icon = (d: ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

export const icons = {
  select: icon(<path d="M3.5 2.5l9 4.6-4 1.2-1.6 4.2z" />),
  hand: icon(
    <path d="M5.5 8V3.8a1 1 0 0 1 2 0V7m0-3.7a1 1 0 0 1 2 0V7m0-2.2a1 1 0 0 1 2 0V9.5c0 2.5-1.7 4-4 4-1.8 0-2.8-.9-3.7-2.4L2.6 8.8a1 1 0 0 1 1.6-1.2L5.5 9" />,
  ),
  shape: icon(<rect x="2.5" y="4" width="11" height="8" rx="2.5" />),
  sticky: icon(<path d="M3 2.5h10v7l-3.5 4H3zM9.5 13.5v-4H13" />),
  text: icon(<path d="M3.5 4V2.8h9V4M8 2.8v10.4M6.2 13.2h3.6" />),
  section: icon(<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2" strokeDasharray="2.4 2" />),
  arrow: icon(<path d="M2.5 11.5h5v-7h6M11 2l2.5 2.5L11 7" />),
  undo: icon(<path d="M5.5 3.5L2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7" />),
  redo: icon(<path d="M10.5 3.5l3 3-3 3M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3" />),
  plus: icon(<path d="M8 3.5v9M3.5 8h9" />),
  minus: icon(<path d="M3.5 8h9" />),
  fit: icon(<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />),
};

function ToolButton({
  label,
  keys,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  keys?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const title = keys ? `${label} (${keys})` : label;
  return (
    <button
      type="button"
      className="wb-tool"
      aria-label={label}
      title={title}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Tools and "add" buttons, floating at the top left of the canvas. */
export function CanvasToolbar({
  tool,
  setTool,
  onAdd,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  onAdd: (k: AddKind) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div
      className="wb-float wb-float--tools left-3 top-3 flex-wrap"
      role="toolbar"
      aria-label="Whiteboard tools"
    >
      <ToolButton
        label="Select"
        keys="V"
        pressed={tool === "select"}
        onClick={() => setTool("select")}
      >
        {icons.select}
      </ToolButton>
      <ToolButton
        label="Pan"
        keys="H or hold Space"
        pressed={tool === "hand"}
        onClick={() => setTool("hand")}
      >
        {icons.hand}
      </ToolButton>
      <span className="wb-sep" aria-hidden="true" />
      <ToolButton label="Add shape" keys="R" onClick={() => onAdd("shape")}>
        {icons.shape}
      </ToolButton>
      <ToolButton label="Add sticky" keys="S" onClick={() => onAdd("sticky")}>
        {icons.sticky}
      </ToolButton>
      <ToolButton label="Add text" keys="T" onClick={() => onAdd("text")}>
        {icons.text}
      </ToolButton>
      <ToolButton label="Add section" keys="G" onClick={() => onAdd("section")}>
        {icons.section}
      </ToolButton>
      <ToolButton
        label="Connect with an arrow"
        keys="A"
        pressed={tool === "arrow"}
        onClick={() => setTool(tool === "arrow" ? "select" : "arrow")}
      >
        {icons.arrow}
      </ToolButton>
      <span className="wb-sep" aria-hidden="true" />
      <ToolButton label="Undo" keys={formatShortcut("mod+z")} disabled={!canUndo} onClick={onUndo}>
        {icons.undo}
      </ToolButton>
      <ToolButton
        label="Redo"
        keys={formatShortcut("mod+shift+z")}
        disabled={!canRedo}
        onClick={onRedo}
      >
        {icons.redo}
      </ToolButton>
    </div>
  );
}

export function ZoomControls({
  zoom,
  bottom,
  onZoom,
  onReset,
  onFit,
}: {
  zoom: number;
  bottom: number;
  onZoom: (factor: number) => void;
  onReset: () => void;
  onFit: () => void;
}) {
  return (
    <div
      className="wb-float right-3"
      style={{ bottom: bottom + 12 }}
      role="toolbar"
      aria-label="Zoom"
    >
      <ToolButton label="Zoom out" keys={formatShortcut("mod+-")} onClick={() => onZoom(0.8)}>
        {icons.minus}
      </ToolButton>
      <button
        type="button"
        className="wb-tool tabular-nums"
        title="Zoom to 100%"
        aria-label={`Zoom ${Math.round(zoom * 100)}%. Reset to 100%`}
        onClick={onReset}
      >
        {Math.round(zoom * 100)}%
      </button>
      <ToolButton label="Zoom in" keys={formatShortcut("mod+=")} onClick={() => onZoom(1.25)}>
        {icons.plus}
      </ToolButton>
      <ToolButton label="Zoom to fit" keys={formatShortcut("mod+0")} onClick={onFit}>
        {icons.fit}
      </ToolButton>
    </div>
  );
}
