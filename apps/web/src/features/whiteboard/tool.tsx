"use client";

import type { LearnTool } from "@/features/learn-panel/types";

/** STUB from Step 0 (ADR-0031). Owned by Phase 9 Lane 4: replace WhiteboardPanel with the canvas. */
function WhiteboardPanel() {
  return (
    <div className="m-4 rounded-lg border border-border-subtle bg-surface-200 p-6">
      <h3 className="type-heading-3 text-ink">Whiteboard</h3>
      <p className="mt-1 text-ink-muted">Claude will draw explanations and mind maps here.</p>
    </div>
  );
}

export const whiteboardTool: LearnTool = {
  id: "whiteboard",
  label: "Whiteboard",
  description: "Claude draws an explanation or a mind map you can edit.",
  Panel: WhiteboardPanel,
};
